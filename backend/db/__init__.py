import os

from .snowflake_client import SnowflakeClient
from .mock_client import MockDBClient


def get_db():
    """Return SnowflakeClient if credentials are present, otherwise MockDBClient."""
    if os.getenv("SNOWFLAKE_ACCOUNT") and os.getenv("SNOWFLAKE_USER") and os.getenv("SNOWFLAKE_PASSWORD"):
        try:
            return SnowflakeClient()
        except Exception:
            pass
    return MockDBClient()


__all__ = ["SnowflakeClient", "MockDBClient", "get_db"]
