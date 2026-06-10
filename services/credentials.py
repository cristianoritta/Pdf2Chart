import json
from pathlib import Path

DEFAULT_MODEL = "llama-3.3-70b-versatile"
CREDENTIALS_FILE = Path(__file__).resolve().parent.parent / "credenciais.json"


def load_credentials() -> dict:
    if not CREDENTIALS_FILE.exists():
        return {"groq_api_key": "", "groq_model": DEFAULT_MODEL}

    try:
        with open(CREDENTIALS_FILE, encoding="utf-8") as f:
            data = json.load(f)
    except (json.JSONDecodeError, OSError):
        return {"groq_api_key": "", "groq_model": DEFAULT_MODEL}

    return {
        "groq_api_key": (data.get("groq_api_key") or "").strip(),
        "groq_model": (data.get("groq_model") or DEFAULT_MODEL).strip(),
    }


def save_credentials(groq_api_key: str, groq_model: str) -> dict:
    data = {
        "groq_api_key": groq_api_key.strip(),
        "groq_model": (groq_model or DEFAULT_MODEL).strip(),
    }
    with open(CREDENTIALS_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    return data


def get_groq_config() -> tuple[str, str]:
    creds = load_credentials()
    api_key = creds["groq_api_key"]
    model = creds["groq_model"] or DEFAULT_MODEL

    if not api_key:
        import os
        api_key = (os.getenv("GROQ_API_KEY") or "").strip().strip('"').strip("'")
        model = os.getenv("GROQ_MODEL", model)

    return api_key, model
