"""Pydantic-схемы routes (Шаг 3 + ТЗ §3 + Fitness-трекинг)."""

from pydantic import BaseModel, Field

from app.schemas.waypoint import WaypointOut

VALID_ACTIVITIES = ("hiking", "walking", "bike", "run", "offroad")
VALID_STATUSES = ("draft", "review", "published", "rejected")


class TrackPoint(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)
    ele: float | None = None
    t: int | None = None  # epoch ms, опционально


class RouteOut(BaseModel):
    id: int
    author_id: int | None = None
    title: str
    description: str | None = None
    activity_type: str = "hiking"
    difficulty: str
    distance_km: float
    elevation_gain_m: int
    steps_count: int = 0
    estimated_time: str | None = None
    max_elevation_m: int | None = None
    photo_url: str | None = None
    status: str = "published"
    geojson_points: str | None = None
    gpx_wkt: str | None = None  # ST_AsText(gpx_data)
    rating: float | None = None


class RouteDetail(RouteOut):
    published_waypoints: list[WaypointOut] = []


class RouteCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    description: str | None = None
    activity_type: str = Field(default="hiking", description="hiking|walking|bike|run|offroad")
    difficulty: str = Field(default="Средний", description="Легкий|Средний|Сложный|Экстремальный")
    distance_km: float = Field(ge=0)
    elevation_gain_m: int = Field(ge=0)
    steps_count: int = Field(default=0, ge=0)
    estimated_time: str | None = None
    max_elevation_m: int | None = None
    photo_url: str | None = None
    status: str | None = Field(default=None, description="draft|review|published (по роли)")
    track_points: list[TrackPoint] | None = Field(default=None, description="Точки GPS-трека")


class RouteRecord(BaseModel):
    """Сохранение записанного GPS-трека (кнопка «Завершить» в Mini App)."""

    title: str = Field(min_length=1, max_length=255)
    description: str | None = None
    activity_type: str = Field(default="hiking")
    difficulty: str = Field(default="Средний")
    track_points: list[TrackPoint] = Field(min_length=2)
    steps_count: int = Field(default=0, ge=0)
    photo_url: str | None = None
    estimated_time: str | None = None


class RouteUpdate(BaseModel):
    title: str | None = Field(default=None, max_length=255)
    description: str | None = None
    activity_type: str | None = None
    difficulty: str | None = None
    distance_km: float | None = Field(default=None, ge=0)
    elevation_gain_m: int | None = Field(default=None, ge=0)
    steps_count: int | None = Field(default=None, ge=0)
    estimated_time: str | None = None
    max_elevation_m: int | None = None
    photo_url: str | None = None
    status: str | None = None
    track_points: list[TrackPoint] | None = None


class GpxImportRequest(BaseModel):
    content: str = Field(min_length=10, max_length=2_000_000)
    format: str = Field(default="gpx", description="gpx|kml")


class GpxImportPreview(BaseModel):
    points: list[TrackPoint]
    distance_km: float
    elevation_gain_m: int
    max_elevation_m: int | None = None
