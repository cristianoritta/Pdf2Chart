import json
import re

from groq import AuthenticationError, Groq

from services.credentials import DEFAULT_MODEL, get_groq_config

ENTITY_TYPES = (
    "Person",
    "Organization",
    "Location",
    "Vehicle",
    "Phone",
    "Email",
    "Document",
    "Account",
    "Event",
    "Anon",
)

SYSTEM_PROMPT = """Você é um analista de inteligência especializado em extração de entidades e vínculos.
Analise o texto fornecido e identifique todas as entidades relevantes e os relacionamentos entre elas.

Regras:
- Cada entidade deve ter um id único sequencial (001, 002, 003...).
- Use entity_type entre: Person, Organization, Location, Vehicle, Phone, Email, Document, Account, Event, Anon.
- O campo "name" é o nome ou identificador principal da entidade.
- O campo "description" resume o papel ou contexto da entidade no documento.
- Cada vínculo deve referenciar source e target pelos ids das entidades.
- O label do vínculo descreve o tipo de relação (ex: "Pai", "Trabalha em", "Proprietário", "Localizado em").
- A description do vínculo explica o contexto da relação com base no texto.
- Extraia apenas informações presentes ou claramente inferíveis do texto.
- Responda APENAS com JSON válido, sem markdown."""

USER_PROMPT_TEMPLATE = """Analise o texto abaixo e retorne JSON no formato:
{{
  "entities": [
    {{"id": "001", "entity_type": "Person", "name": "Nome", "description": "Contexto"}}
  ],
  "relationships": [
    {{"source": "001", "target": "002", "label": "Tipo de relação", "description": "Contexto da relação"}}
  ]
}}

TEXTO:
{text}"""


def _parse_json_response(content: str) -> dict:
    content = content.strip()
    if content.startswith("```"):
        content = re.sub(r"^```(?:json)?\s*", "", content)
        content = re.sub(r"\s*```$", "", content)
    return json.loads(content)


def _get_groq_settings(api_key: str | None = None, model: str | None = None) -> tuple[str, str]:
    stored_key, stored_model = get_groq_config()
    key = (api_key or stored_key).strip().strip('"').strip("'")
    chosen_model = (model or stored_model or DEFAULT_MODEL).strip()

    if not key:
        raise ValueError(
            "Chave Groq não configurada. Clique no ícone de engrenagem "
            "e informe sua API Key em https://console.groq.com/keys"
        )
    if not key.startswith("gsk_"):
        raise ValueError("API Key inválida: a chave deve começar com 'gsk_'.")
    return key, chosen_model


def analyze_text(text: str, api_key: str | None = None, model: str | None = None) -> dict:
    key, chosen_model = _get_groq_settings(api_key, model)
    client = Groq(api_key=key)
    truncated = text[:120_000]

    try:
        response = client.chat.completions.create(
            model=chosen_model,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": USER_PROMPT_TEMPLATE.format(text=truncated)},
            ],
            temperature=0.1,
            response_format={"type": "json_object"},
        )
    except AuthenticationError as exc:
        raise ValueError(
            "Chave da Groq rejeitada (401). Gere uma nova em https://console.groq.com/keys "
            "e atualize em Configurações (ícone de engrenagem)."
        ) from exc

    raw = response.choices[0].message.content or "{}"
    data = _parse_json_response(raw)

    entities = data.get("entities", [])
    relationships = data.get("relationships", [])

    valid_types = set(ENTITY_TYPES)
    for entity in entities:
        if entity.get("entity_type") not in valid_types:
            entity["entity_type"] = "Anon"

    return {"entities": entities, "relationships": relationships}
