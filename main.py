import os
import json
import logging
from datetime import datetime
from pathlib import Path
from typing import List, Optional

from fastapi import FastAPI, File, UploadFile, Depends, HTTPException, Form
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, HTMLResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
from dotenv import load_dotenv

from database import get_db, create_tables, ContentItem, Output, Event, GRUPOS
from processors import extract_text, get_file_type

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="MyDigest")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR  = Path("uploads");  UPLOAD_DIR.mkdir(exist_ok=True)
PODCAST_DIR = Path("podcasts"); PODCAST_DIR.mkdir(exist_ok=True)

create_tables()

app.mount("/podcasts", StaticFiles(directory="podcasts"), name="podcasts")
app.mount("/uploads",  StaticFiles(directory="uploads"),  name="uploads")
app.mount("/static",   StaticFiles(directory="static"),   name="static")


@app.get("/")
async def root():
    from fastapi.responses import FileResponse
    return FileResponse("static/index.html")


@app.get("/grupos")
async def list_grupos():
    return GRUPOS


# ── Upload ─────────────────────────────────────────────────────────────────
@app.post("/upload")
async def upload_files(
    files: List[UploadFile] = File(...),
    fecha_contenido: Optional[str] = Form(None),
    grupo: Optional[str] = Form(None),
    db: Session = Depends(get_db),
):
    results = []
    for file in files:
        # Save
        safe_name = file.filename.replace("/", "_").replace("..", "_")
        save_path = UPLOAD_DIR / safe_name
        content = await file.read()
        with open(save_path, "wb") as f:
            f.write(content)

        tipo = get_file_type(file.filename)
        texto = None
        warning = None
        try:
            texto = extract_text(str(save_path), file.filename, file.content_type)
        except Exception as e:
            warning = str(e)
            logger.error(f"Failed to process {file.filename}: {e}")

        item = ContentItem(
            titulo=file.filename,
            tipo=tipo,
            texto_extraido=texto,
            fecha_contenido=fecha_contenido,
            grupo=grupo,
            archivo_path=str(save_path),
            incluido_en_digest=True,
        )
        db.add(item)
        db.commit()
        db.refresh(item)

        results.append({
            "id": item.id,
            "titulo": item.titulo,
            "tipo": item.tipo,
            "fecha_creacion": item.fecha_creacion.isoformat(),
            "fecha_contenido": item.fecha_contenido,
            "grupo": item.grupo,
            "preview": (texto[:100] if texto else None),
            "warning": warning,
        })

    return JSONResponse(content={"items": results})


# ── Audio memo ─────────────────────────────────────────────────────────────
@app.post("/upload-audio-memo")
async def upload_audio_memo(
    file: UploadFile = File(...),
    fecha_contenido: Optional[str] = Form(None),
    grupo: Optional[str] = Form(None),
    db: Session = Depends(get_db),
):
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename  = f"memo_{timestamp}.webm"
    save_path = UPLOAD_DIR / filename
    content   = await file.read()
    with open(save_path, "wb") as f:
        f.write(content)

    texto = None
    warning = None
    try:
        texto = extract_text(str(save_path), filename, "audio/webm")
    except Exception as e:
        warning = str(e)
        logger.error(f"Failed to transcribe memo: {e}")

    item = ContentItem(
        titulo=f"Nota de voz {timestamp}",
        tipo="Audio",
        texto_extraido=texto,
        fecha_contenido=fecha_contenido,
        grupo=grupo,
        archivo_path=str(save_path),
        incluido_en_digest=True,
    )
    db.add(item)
    db.commit()
    db.refresh(item)

    return {
        "id": item.id,
        "titulo": item.titulo,
        "tipo": item.tipo,
        "fecha_creacion": item.fecha_creacion.isoformat(),
        "fecha_contenido": item.fecha_contenido,
        "grupo": item.grupo,
        "preview": (texto[:100] if texto else None),
        "warning": warning,
        "tiene_texto": texto is not None,
        "incluido_en_digest": True,
    }


# ── Items ──────────────────────────────────────────────────────────────────
@app.get("/items")
async def list_items(grupo: Optional[str] = None, db: Session = Depends(get_db)):
    q = db.query(ContentItem)
    if grupo:
        q = q.filter(ContentItem.grupo == grupo)
    items = q.order_by(ContentItem.fecha_creacion.desc()).all()
    return [_item_dict(i) for i in items]


def _item_dict(i: ContentItem):
    # Build a URL-accessible path for the uploaded file
    file_url = None
    if i.archivo_path:
        fname = Path(i.archivo_path).name
        file_url = f"/uploads/{fname}"
    return {
        "id": i.id,
        "titulo": i.titulo,
        "tipo": i.tipo,
        "fecha_creacion": i.fecha_creacion.isoformat(),
        "fecha_contenido": i.fecha_contenido,
        "grupo": i.grupo,
        "preview": (i.texto_extraido[:100] if i.texto_extraido else None),
        "incluido_en_digest": i.incluido_en_digest,
        "tiene_texto": i.texto_extraido is not None,
        "file_url": file_url,
        "extension": Path(i.archivo_path).suffix.lower() if i.archivo_path else None,
    }


@app.patch("/items/{item_id}")
async def update_item(item_id: int, payload: dict, db: Session = Depends(get_db)):
    item = db.query(ContentItem).filter(ContentItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404)
    if "incluido_en_digest" in payload:
        item.incluido_en_digest = payload["incluido_en_digest"]
    db.commit()
    return {"ok": True}


@app.delete("/items/{item_id}")
async def delete_item(item_id: int, db: Session = Depends(get_db)):
    item = db.query(ContentItem).filter(ContentItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404)
    db.delete(item)
    db.commit()
    return {"ok": True}


# ── Generate ───────────────────────────────────────────────────────────────
class GenerateRequest(BaseModel):
    tipo: str  # podcast | resumen | diapositivas


@app.post("/generate")
async def generate(req: GenerateRequest, db: Session = Depends(get_db)):
    items = db.query(ContentItem).filter(
        ContentItem.incluido_en_digest == True,
        ContentItem.texto_extraido != None,
    ).all()

    if not items:
        raise HTTPException(status_code=400, detail="No hay ítems seleccionados con texto extraído")

    anthropic_key = os.getenv("ANTHROPIC_API_KEY")
    if not anthropic_key:
        raise HTTPException(status_code=500, detail="ANTHROPIC_API_KEY no configurada")

    combined = "\n\n---\n\n".join(f"[{i.titulo}]\n{i.texto_extraido}" for i in items)
    item_ids = [i.id for i in items]

    import anthropic
    client = anthropic.Anthropic(api_key=anthropic_key)

    # ── Podcast ────────────────────────────────────────────────────────────
    if req.tipo == "podcast":
        openai_key = os.getenv("OPENAI_API_KEY")
        if not openai_key:
            raise HTTPException(status_code=500, detail="OPENAI_API_KEY no configurada")

        script = _call_claude(client, combined, _PROMPT_PODCAST)

        from openai import OpenAI
        oai = OpenAI(api_key=openai_key)

        timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M")
        filename  = f"digest_{timestamp}.mp3"
        out_path  = PODCAST_DIR / filename

        with oai.audio.speech.with_streaming_response.create(
            model="tts-1", voice="alloy", input=script
        ) as response:
            response.stream_to_file(str(out_path))

        words    = len(script.split())
        duracion = f"~{round(words/140)} min"

        output = Output(
            tipo="podcast",
            archivo_path=str(out_path),
            items_incluidos=item_ids,
            duracion_estimada=duracion,
            titulo=f"Podcast {timestamp}",
        )
        db.add(output); db.commit(); db.refresh(output)

        return {
            "id": output.id,
            "tipo": "podcast",
            "fecha": output.fecha.isoformat(),
            "archivo_path": f"/podcasts/{filename}",
            "duracion_estimada": duracion,
            "items_incluidos": item_ids,
        }

    # ── Resumen ────────────────────────────────────────────────────────────
    elif req.tipo == "resumen":
        html = _call_claude(client, combined, _PROMPT_RESUMEN)

        output = Output(
            tipo="resumen",
            contenido=html,
            items_incluidos=item_ids,
            titulo=f"Resumen {datetime.now().strftime('%Y-%m-%d %H:%M')}",
        )
        db.add(output); db.commit(); db.refresh(output)

        return {
            "id": output.id,
            "tipo": "resumen",
            "fecha": output.fecha.isoformat(),
            "contenido": html,
            "items_incluidos": item_ids,
        }

    # ── Diapositivas ───────────────────────────────────────────────────────
    elif req.tipo == "diapositivas":
        html = _call_claude(client, combined, _PROMPT_SLIDES)

        output = Output(
            tipo="diapositivas",
            contenido=html,
            items_incluidos=item_ids,
            titulo=f"Slides {datetime.now().strftime('%Y-%m-%d %H:%M')}",
        )
        db.add(output); db.commit(); db.refresh(output)

        return {
            "id": output.id,
            "tipo": "diapositivas",
            "fecha": output.fecha.isoformat(),
            "contenido": html,
            "items_incluidos": item_ids,
        }

    else:
        raise HTTPException(status_code=400, detail="Tipo inválido")


def _call_claude(client, content: str, system: str) -> str:
    msg = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=4096,
        system=system,
        messages=[{"role": "user", "content": content}],
    )
    return msg.content[0].text


_PROMPT_PODCAST = (
    "Eres un locutor de podcast. Tu tarea es tomar estos fragmentos de contenido "
    "que el usuario guardó y convertirlos en un episodio de podcast fluido, "
    "conversacional y entretenido. Debe durar aproximadamente 20 minutos cuando "
    "se lee en voz alta (aprox 2800 palabras). Estructura: intro breve, "
    "desarrollá cada tema de forma natural conectándolos cuando puedas, "
    "cierre. Tono: cercano, como explicándole a un amigo inteligente. "
    "Devuelve SOLO el guión, sin marcas de formato, listo para TTS."
)

_PROMPT_RESUMEN = (
    "Eres un asistente experto en síntesis de contenido. "
    "Analizá los fragmentos y devolvé un resumen ejecutivo completo en HTML limpio. "
    "Usa estas etiquetas: <h2> para secciones, <p> para párrafos, <ul><li> para listas, "
    "<strong> para conceptos clave, <blockquote> para citas o datos importantes. "
    "Estructura sugerida: título principal <h1>, resumen general (2-3 oraciones), "
    "luego una sección por cada fuente con puntos clave. "
    "Devuelve SOLO el HTML, sin ```html ni explicaciones."
)

_PROMPT_SLIDES = (
    "Eres un experto en presentaciones. Convertí el contenido en una presentación "
    "de diapositivas en formato HTML. Generá entre 6 y 10 diapositivas. "
    "Cada diapositiva debe ser un <section class='slide'> con: "
    "<h2> para el título de la slide, <p> o <ul><li> para el contenido, "
    "máximo 5 puntos por slide, lenguaje directo y conciso. "
    "La primera slide es el título general con subtítulo. "
    "La última slide es un cierre/conclusión. "
    "Devuelve SOLO las etiquetas <section class='slide'>...</section> concatenadas, "
    "sin HTML wrapping ni explicaciones."
)


# ── Outputs list ───────────────────────────────────────────────────────────
@app.get("/outputs")
async def list_outputs(db: Session = Depends(get_db)):
    outs = db.query(Output).order_by(Output.fecha.desc()).all()
    return [
        {
            "id": o.id,
            "tipo": o.tipo,
            "titulo": o.titulo,
            "fecha": o.fecha.isoformat(),
            "archivo_path": ("/podcasts/" + Path(o.archivo_path).name) if o.archivo_path else None,
            "contenido": o.contenido,
            "items_incluidos": o.items_incluidos,
            "duracion_estimada": o.duracion_estimada,
        }
        for o in outs
    ]


# ── Events (Calendar) ──────────────────────────────────────────────────────
class EventCreate(BaseModel):
    titulo:        str
    descripcion:   Optional[str] = None
    fecha:         str            # YYYY-MM-DD
    hora:          Optional[str] = None   # HH:MM
    propiedades:   Optional[dict] = None
    color:         Optional[str] = "#8b7cf6"
    notif_minutos: Optional[int] = None


@app.post("/events")
async def create_event(ev: EventCreate, db: Session = Depends(get_db)):
    event = Event(
        titulo=ev.titulo,
        descripcion=ev.descripcion,
        fecha=ev.fecha,
        hora=ev.hora,
        propiedades=ev.propiedades or {},
        color=ev.color,
        notif_minutos=ev.notif_minutos,
    )
    db.add(event); db.commit(); db.refresh(event)
    return _event_dict(event)


@app.get("/events")
async def list_events(db: Session = Depends(get_db)):
    evs = db.query(Event).order_by(Event.fecha, Event.hora).all()
    return [_event_dict(e) for e in evs]


@app.patch("/events/{eid}")
async def update_event(eid: int, payload: dict, db: Session = Depends(get_db)):
    ev = db.query(Event).filter(Event.id == eid).first()
    if not ev:
        raise HTTPException(status_code=404)
    for field in ("titulo","descripcion","fecha","hora","propiedades","color","notif_minutos","completado"):
        if field in payload:
            setattr(ev, field, payload[field])
    db.commit()
    return _event_dict(ev)


@app.delete("/events/{eid}")
async def delete_event(eid: int, db: Session = Depends(get_db)):
    ev = db.query(Event).filter(Event.id == eid).first()
    if not ev:
        raise HTTPException(status_code=404)
    db.delete(ev); db.commit()
    return {"ok": True}


def _event_dict(e: Event):
    return {
        "id": e.id,
        "titulo": e.titulo,
        "descripcion": e.descripcion,
        "fecha": e.fecha,
        "hora": e.hora,
        "propiedades": e.propiedades or {},
        "color": e.color,
        "notif_minutos": e.notif_minutos,
        "completado": e.completado,
        "fecha_creacion": e.fecha_creacion.isoformat(),
    }
