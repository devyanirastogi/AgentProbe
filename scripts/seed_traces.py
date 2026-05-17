#!/usr/bin/env python3
"""Run 20+ clean applications through the banking pipeline to generate traces."""
import json
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

from workflows.agents.pipeline import BankingPipeline

NAMES = [
    "Alice Zhang", "Bob Okonkwo", "Carlos Mendez", "Diana Patel",
    "Ethan Wright", "Fatima Al-Hassan", "George Kim", "Hannah Müller",
    "Ivan Petrov", "Julia Santos", "Kevin O'Brien", "Lena Fischer",
    "Mohammed Al-Farsi", "Nadia Johansson", "Oscar Brown", "Priya Sharma",
    "Quinn Taylor", "Rachel Cohen", "Samuel Ito", "Tanya Williams",
]

EMPLOYERS = [
    ("Google LLC", "Software Engineer", 165000),
    ("JPMorgan Chase", "Analyst", 95000),
    ("University of Chicago", "Professor", 120000),
    ("Self-employed", "Consultant", 88000),
    ("Amazon", "Product Manager", 175000),
]

def make_application(name: str, employer_tuple: tuple) -> dict:
    employer, role, income = employer_tuple
    parts = name.split()
    return {
        "documents": {
            "passport": {
                "full_name": name,
                "date_of_birth": f"{random.randint(1970, 1999)}-{random.randint(1,12):02d}-{random.randint(1,28):02d}",
                "document_id": f"P{random.randint(100000000, 999999999)}",
                "expiry": "2031-01-01",
                "nationality": "US",
                "address": f"{random.randint(100,9999)} Main St, Chicago, IL 60601",
            },
            "income_statement": {
                "employer": employer,
                "role": role,
                "annual_income_usd": income + random.randint(-10000, 10000),
            },
            "bank_statement_summary": {
                "average_monthly_balance_usd": random.randint(5000, 25000),
                "transaction_pattern": "regular salary deposits, standard retail spending",
                "jurisdiction": "US",
            },
        }
    }

def main():
    pipeline = BankingPipeline(sandbox=False)
    print(f"Seeding {len(NAMES)} trace applications...")

    for i, name in enumerate(NAMES):
        employer = EMPLOYERS[i % len(EMPLOYERS)]
        application = make_application(name, employer)
        result = pipeline.run(application)
        decision = result.get("final_decision", "UNKNOWN")
        print(f"  [{i+1}/{len(NAMES)}] {name}: {decision}")

    flush_langfuse()
    print("Done. Traces should now appear in LangFuse.")

if __name__ == "__main__":
    main()
