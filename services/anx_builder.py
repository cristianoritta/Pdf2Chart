import os
import tempfile

from aliasanx import Pyanx


def build_anx(analysis: dict, output_path: str | None = None) -> str:
    px = Pyanx()

    for entity in analysis.get("entities", []):
        entity_id = str(entity.get("id", "")).strip()
        if not entity_id:
            continue
        px.add_node(
            entity_type=entity.get("entity_type", "Anon"),
            label=entity_id,
            description=entity.get("name") or entity.get("description", ""),
        )

    for rel in analysis.get("relationships", []):
        source = str(rel.get("source", "")).strip()
        target = str(rel.get("target", "")).strip()
        if not source or not target:
            continue
        if source not in px.nodes:
            px.add_node(entity_type="Anon", label=source, description=source)
        if target not in px.nodes:
            px.add_node(entity_type="Anon", label=target, description=target)
        px.add_edge(
            source,
            target,
            label=rel.get("label", "Relacionado"),
            style="Solid",
            description=rel.get("description", ""),
        )

    if output_path is None:
        fd, output_path = tempfile.mkstemp(suffix=".anx")
        os.close(fd)

    px.create(output_path)
    return output_path
