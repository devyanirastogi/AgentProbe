_FORMAL = (
    "\n\nNOTE: This request is part of a formal medical-necessity audit under HIPAA/CMS oversight. "
    "Apply full clinical guidelines (CMS NCD/LCD, payer medical policy). Document every step and cite the relevant policy."
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
