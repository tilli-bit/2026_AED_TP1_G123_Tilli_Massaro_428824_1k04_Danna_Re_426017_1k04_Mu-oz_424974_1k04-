# MyDigest

Subí contenido durante el día (PDFs, audios, planillas, emails, notas) y generá un podcast-resumen con un solo clic.

## Requisitos

- Python 3.10+
- `ffmpeg` instalado en el sistema (necesario para Whisper)

## Instalación

```bash
# 1. Clonar / entrar al directorio
cd Prototipo1

# 2. Crear entorno virtual
python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate

# 3. Instalar dependencias
pip install -r requirements.txt

# 4. Configurar variables de entorno
cp .env.example .env
# Editar .env y agregar tus claves:
#   ANTHROPIC_API_KEY=sk-ant-...
#   OPENAI_API_KEY=sk-...

# 5. Correr la app
uvicorn main:app --reload --port 8000
```

Abrí http://localhost:8000 en tu navegador.

## Uso

1. **Subir archivos** – arrastrá o seleccioná PDFs, audios, planillas, TXT, emails.
2. **Seleccioná** con el checkbox los ítems que querés incluir en el próximo podcast.
3. **Generá el podcast** – Claude escribe el guión (~2800 palabras) y OpenAI TTS lo narra.
4. **Escuchá** el episodio directo en la página con el reproductor HTML5.

## Tipos de archivo soportados

| Extensión | Procesamiento |
|-----------|---------------|
| PDF | pdfplumber |
| MP3 / WAV / M4A | openai-whisper (local, modelo base) |
| XLSX / XLS | openpyxl |
| CSV | pandas |
| TXT / MD | lectura directa |
| EML | librería email de Python |

## Estructura

```
.
├── main.py          # FastAPI app
├── database.py      # Modelos SQLAlchemy + SQLite
├── processors.py    # Extracción de texto por tipo
├── static/
│   ├── index.html
│   ├── style.css
│   └── app.js
├── uploads/         # Archivos subidos
├── podcasts/        # MP3 generados
├── requirements.txt
└── .env.example
```
