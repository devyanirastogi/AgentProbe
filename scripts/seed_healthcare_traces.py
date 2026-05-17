#!/usr/bin/env python3
"""Run 20 synthetic patient pre-authorization requests through HealthcarePipeline.

Mirrors seed_traces.py. With LANGFUSE_PUBLIC_KEY + LANGFUSE_SECRET_KEY set in
backend/.env, each pipeline run becomes a LangFuse trace tagged
`workflow:healthcare`, with a span per agent and a generation per Anthropic call.
View them in your LangFuse project once the script completes.
"""
import random
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), "..", "backend", ".env"))

# Initialize LangFuse before importing the pipeline so observations have a
# live client to send to.
from workflows._telemetry import init_langfuse, flush_langfuse
init_langfuse()

from workflows.healthcare_agents.pipeline import HealthcarePipeline


PATIENTS = [
    "Alice Zhang", "Bob Okonkwo", "Carlos Mendez", "Diana Patel",
    "Ethan Wright", "Fatima Al-Hassan", "George Kim", "Hannah Müller",
    "Ivan Petrov", "Julia Santos", "Kevin O'Brien", "Lena Fischer",
    "Mohammed Al-Farsi", "Nadia Johansson", "Oscar Brown", "Priya Sharma",
    "Quinn Taylor", "Rachel Cohen", "Samuel Ito", "Tanya Williams",
]

PAYERS = [
    ("Blue Cross Blue Shield", "PPO"),
    ("Aetna", "HMO"),
    ("United Healthcare", "PPO"),
    ("Cigna", "EPO"),
    ("Medicare", "MEDICARE"),
    ("Kaiser Permanente", "HMO"),
]

# (presenting_complaint, ICD-10, requested CPT, allergies, active meds)
ENCOUNTERS = [
    ("Persistent lower back pain x 6 weeks", ["M54.5"], "72148",
     ["Penicillin"], ["Ibuprofen 600mg PRN"]),
    ("Type 2 diabetes follow-up, A1c uncontrolled", ["E11.9"], "83036",
     [], ["Metformin 1000mg BID", "Lisinopril 10mg daily"]),
    ("Acute appendicitis, RLQ pain x 12 hours", ["K35.80"], "44970",
     ["Latex"], []),
    ("Migraine, refractory to oral therapy", ["G43.909"], "64615",
     ["Sulfa"], ["Sumatriptan 100mg PRN", "Topiramate 50mg BID"]),
    ("Atrial fibrillation, new onset", ["I48.91"], "93000",
     [], ["Apixaban 5mg BID"]),
    ("Routine annual physical exam", ["Z00.00"], "99395",
     [], []),
    ("Knee osteoarthritis, conservative therapy failed", ["M17.11"], "27447",
     [], ["Acetaminophen 1000mg TID"]),
    ("Major depressive disorder, medication management", ["F33.1"], "90834",
     [], ["Sertraline 100mg daily"]),
]


def make_patient_packet(name: str, payer_tuple: tuple, encounter_tuple: tuple) -> dict:
    payer, plan_type = payer_tuple
    complaint, icd10, cpt, allergies, meds = encounter_tuple
    dob = f"{random.randint(1945, 2005)}-{random.randint(1,12):02d}-{random.randint(1,28):02d}"

    return {
        "documents": {
            "intake_form": {
                "patient_name": name,
                "date_of_birth": dob,
                "mrn": f"MRN{random.randint(1000000, 9999999)}",
                "chief_complaint": complaint,
                "allergies": allergies,
                "current_medications": meds,
            },
            "insurance_card": {
                "payer": payer,
                "plan_type": plan_type,
                "member_id": f"{plan_type[:3]}{random.randint(100000000, 999999999)}",
                "group_number": f"G{random.randint(10000, 99999)}",
                "effective_date": "2026-01-01",
            },
            "physician_order": {
                "ordering_provider": f"Dr. {random.choice(['Smith','Patel','Nguyen','Garcia','Johnson'])}",
                "npi": f"{random.randint(1000000000, 1999999999)}",
                "requested_cpt": cpt,
                "diagnosis_codes": icd10,
                "clinical_justification": f"Patient presents with {complaint.lower()}. Requesting {cpt} for diagnostic/therapeutic management per standard of care.",
                "prior_authorizations": [],
            },
        }
    }


def main():
    pipeline = HealthcarePipeline(sandbox=False)
    print(f"Seeding {len(PATIENTS)} healthcare pre-auth requests...")

    for i, name in enumerate(PATIENTS):
        payer = PAYERS[i % len(PAYERS)]
        encounter = ENCOUNTERS[i % len(ENCOUNTERS)]
        packet = make_patient_packet(name, payer, encounter)
        result = pipeline.run(packet)
        decision = result.get("final_decision", "UNKNOWN")
        print(f"  [{i+1}/{len(PATIENTS)}] {name} ({payer[0]}): {decision}")

    flush_langfuse()
    print("Done. Traces should now appear in LangFuse.")


if __name__ == "__main__":
    main()
