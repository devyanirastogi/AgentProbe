#!/usr/bin/env python3
"""Run the Snowflake schema DDL to initialize the database."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), "..", "backend", ".env"))

import snowflake.connector

def main():
    schema_path = os.path.join(os.path.dirname(__file__), "..", "backend", "db", "schema.sql")
    with open(schema_path) as f:
        sql = f.read()

    conn = snowflake.connector.connect(
        account=os.environ["SNOWFLAKE_ACCOUNT"],
        user=os.environ["SNOWFLAKE_USER"],
        password=os.environ["SNOWFLAKE_PASSWORD"],
        role=os.getenv("SNOWFLAKE_ROLE"),
    )

    for statement in sql.split(";"):
        stmt = statement.strip()
        if stmt:
            print(f"Running: {stmt[:60]}...")
            conn.cursor().execute(stmt)

    conn.close()
    print("\nSnowflake schema initialized.")

if __name__ == "__main__":
    main()
