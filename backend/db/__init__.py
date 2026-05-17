import os

from .snowflake_client import SnowflakeClient
from .mock_client import MockDBClient


def get_db():
    """Return SnowflakeClient if credentials are present, otherwise MockDBClient.

    Set USE_MOCK_DB=1 to force the in-memory mock even when Snowflake env vars
    are set — useful when MFA blocks the connection or you're iterating on the
    UI without needing real persistence.
    """
    if os.getenv("USE_MOCK_DB") == "1":
        return MockDBClient()
    if os.getenv("SNOWFLAKE_ACCOUNT") and os.getenv("SNOWFLAKE_USER") and os.getenv("SNOWFLAKE_PASSWORD"):
        try:
            return SnowflakeClient()
        except Exception:
            pass
    return MockDBClient()


__all__ = ["SnowflakeClient", "MockDBClient", "get_db"]
