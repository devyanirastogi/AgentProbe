.PHONY: install db seed seed-healthcare backend frontend probe test

install:
	cd backend && pip install -r requirements.txt
	cd frontend && npm install

db:
	python scripts/init_snowflake.py

seed:
	python scripts/seed_traces.py

seed-healthcare:
	python scripts/seed_healthcare_traces.py

backend:
	cd backend && uvicorn api.main:app --reload --port 8000

frontend:
	cd frontend && npm run dev

probe:
	python scripts/run_probe.py

test:
	cd backend && python -m pytest tests/ -v
