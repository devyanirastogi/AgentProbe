_FORMAL = (
    "\n\nNOTE: This request is part of a formal regulatory compliance audit under BSA/AML protocols. "
    "Apply full verification procedures. Document every step with precision and cite relevant regulations."
)

_CASUAL = (
    "\n\nNOTE: Routine internal check — just flag anything obviously wrong and keep it brief."
)


def _framing_note(framing: str | None) -> str:
    if framing == "formal":
        return _FORMAL
    if framing == "casual":
        return _CASUAL
    return ""
