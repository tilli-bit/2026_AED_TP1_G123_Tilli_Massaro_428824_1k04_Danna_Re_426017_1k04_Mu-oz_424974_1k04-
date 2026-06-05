from sqlalchemy import create_engine, Column, Integer, String, Boolean, DateTime, Text, JSON, Date
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from datetime import datetime

DATABASE_URL = "sqlite:///./mydigest.db"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

GRUPOS = [
    {"id": "escuela",    "label": "Escuela",     "emoji": "🎒"},
    {"id": "trabajo",    "label": "Trabajo",      "emoji": "💼"},
    {"id": "personal",   "label": "Personal",     "emoji": "🙋"},
    {"id": "salud",      "label": "Salud",        "emoji": "🏥"},
    {"id": "finanzas",   "label": "Finanzas",     "emoji": "💰"},
    {"id": "ideas",      "label": "Ideas",        "emoji": "💡"},
    {"id": "noticias",   "label": "Noticias",     "emoji": "📰"},
    {"id": "reuniones",  "label": "Reuniones",    "emoji": "🤝"},
    {"id": "viajes",     "label": "Viajes",       "emoji": "✈️"},
    {"id": "otros",      "label": "Otros",        "emoji": "📦"},
]


class ContentItem(Base):
    __tablename__ = "content_items"

    id               = Column(Integer, primary_key=True, index=True)
    titulo           = Column(String, nullable=False)
    tipo             = Column(String, nullable=False)
    texto_extraido   = Column(Text, nullable=True)
    fecha_creacion   = Column(DateTime, default=datetime.utcnow)
    fecha_contenido  = Column(String, nullable=True)   # user-selected date (ISO string)
    grupo            = Column(String, nullable=True)   # group id
    incluido_en_digest = Column(Boolean, default=True)
    archivo_path     = Column(String, nullable=True)   # path to uploaded file


class Event(Base):
    """Calendar events / reminders."""
    __tablename__ = "events"

    id                  = Column(Integer, primary_key=True, index=True)
    titulo              = Column(String, nullable=False)
    descripcion         = Column(Text, nullable=True)
    fecha               = Column(String, nullable=False)   # YYYY-MM-DD
    hora                = Column(String, nullable=True)    # HH:MM  (optional)
    propiedades         = Column(JSON, nullable=True)      # free key-value pairs
    color               = Column(String, default="#8b7cf6")
    notif_minutos       = Column(Integer, nullable=True)   # minutes before to notify (None = no notif)
    fecha_creacion      = Column(DateTime, default=datetime.utcnow)
    completado          = Column(Boolean, default=False)


class Output(Base):
    """Stores generated outputs: podcast, summary, or slides."""
    __tablename__ = "outputs"

    id               = Column(Integer, primary_key=True, index=True)
    tipo             = Column(String, nullable=False)  # podcast | resumen | diapositivas
    fecha            = Column(DateTime, default=datetime.utcnow)
    archivo_path     = Column(String, nullable=True)   # MP3 path (podcast only)
    contenido        = Column(Text, nullable=True)     # HTML/text (resumen, diapositivas)
    items_incluidos  = Column(JSON, nullable=False)
    duracion_estimada = Column(String, nullable=True)
    titulo           = Column(String, nullable=True)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def create_tables():
    Base.metadata.create_all(bind=engine)
