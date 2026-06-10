import os
import uuid
from pathlib import Path

import logging
import shutil
import subprocess
import time

from dotenv import load_dotenv
from flask import Flask, jsonify, render_template, request, send_file
import flaskwebgui
from flaskwebgui import FlaskUI, kill_port
from werkzeug.utils import secure_filename

from services.anx_builder import build_anx
from services.credentials import load_credentials, save_credentials
from services.groq_analyzer import analyze_text
from services.pdf_extractor import extract_text_from_pdf

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")
OUTPUT_DIR = BASE_DIR / "output"
OUTPUT_DIR.mkdir(exist_ok=True)

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 50 * 1024 * 1024  # 50 MB


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/credentials", methods=["GET"])
def get_credentials():
    creds = load_credentials()
    return jsonify({
        "groq_api_key": creds["groq_api_key"],
        "groq_model": creds["groq_model"],
        "configured": bool(creds["groq_api_key"]),
    })


@app.route("/api/credentials", methods=["POST"])
def post_credentials():
    data = request.get_json(silent=True) or {}
    api_key = (data.get("groq_api_key") or "").strip()
    model = (data.get("groq_model") or "").strip()

    if not api_key:
        return jsonify({"error": "Informe a API Key da Groq."}), 400
    if not api_key.startswith("gsk_"):
        return jsonify({"error": "API Key inválida: deve começar com 'gsk_'."}), 400
    if not model:
        return jsonify({"error": "Informe o modelo Groq."}), 400

    creds = save_credentials(api_key, model)
    return jsonify({"ok": True, "groq_model": creds["groq_model"]})


@app.route("/analyze", methods=["POST"])
def analyze():
    if "pdf" not in request.files:
        return jsonify({"error": "Nenhum arquivo enviado."}), 400

    pdf_file = request.files["pdf"]
    if not pdf_file.filename:
        return jsonify({"error": "Arquivo inválido."}), 400

    if not pdf_file.filename.lower().endswith(".pdf"):
        return jsonify({"error": "Apenas arquivos PDF são aceitos."}), 400

    try:
        file_bytes = pdf_file.read()
        text = extract_text_from_pdf(file_bytes)

        if not text.strip():
            return jsonify({"error": "Não foi possível extrair texto do PDF."}), 422

        analysis = analyze_text(text)

        base_name = secure_filename(Path(pdf_file.filename).stem) or "documento"
        token = uuid.uuid4().hex[:8]
        anx_filename = f"{base_name}_{token}.anx"
        anx_path = OUTPUT_DIR / anx_filename

        build_anx(analysis, str(anx_path))

        return jsonify({
            "entities": analysis["entities"],
            "relationships": analysis["relationships"],
            "stats": {
                "entities": len(analysis["entities"]),
                "relationships": len(analysis["relationships"]),
                "characters": len(text),
            },
            "download_url": f"/download/{anx_filename}",
            "anx_filename": anx_filename,
        })

    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:
        return jsonify({"error": f"Erro ao processar: {exc}"}), 500


@app.route("/download/<filename>")
def download(filename):
    safe_name = secure_filename(filename)
    file_path = OUTPUT_DIR / safe_name
    if not file_path.exists():
        return jsonify({"error": "Arquivo não encontrado."}), 404
    return send_file(file_path, as_attachment=True, download_name=safe_name)


def _patch_flaskwebgui_logging():
    """Corrige logger.info com sintaxe inválida no flaskwebgui 1.1.7."""
    def start_browser(self, server_process):
        logging.getLogger("flaskwebgui").info(
            "Command: %s", " ".join(self.browser_command)
        )
        flaskwebgui.FLASKWEBGUI_BROWSER_PROCESS = subprocess.Popen(self.browser_command)
        self.browser_pid = flaskwebgui.FLASKWEBGUI_BROWSER_PROCESS.pid
        flaskwebgui.FLASKWEBGUI_BROWSER_PROCESS.wait()

        if not self.auto_close:
            return

        if self.browser_path is None:
            while self.__keyboard_interrupt is False:
                time.sleep(1)

        from multiprocessing import Process

        if isinstance(server_process, Process):
            if self.on_shutdown is not None:
                self.on_shutdown()
            self.browser_pid = None
            shutil.rmtree(self.profile_dir, ignore_errors=True)
            server_process.kill()
        else:
            if self.on_shutdown is not None:
                self.on_shutdown()
            self.browser_pid = None
            shutil.rmtree(self.profile_dir, ignore_errors=True)
            kill_port(self.port)

    FlaskUI.start_browser = start_browser


def main():
    _patch_flaskwebgui_logging()
    ui = FlaskUI(
        app=app,
        server="flask",
        width=1280,
        height=860,
        fullscreen=False,
    )
    ui.run()


if __name__ == "__main__":
    main()
