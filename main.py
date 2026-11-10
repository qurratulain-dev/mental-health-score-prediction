import gzip
import os
import pickle
import warnings
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Literal

import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, ConfigDict, Field

warnings.filterwarnings("ignore", message="Found unknown categories")

BASE_DIR = Path(__file__).resolve().parent
MODEL_PATH = BASE_DIR / "mental_health_pipeline.pkl.gz"

GENDERS = ["Male", "Female"]
ACADEMIC_LEVELS = ["High School", "Undergraduate", "Graduate"]
PLATFORMS = [
    "Facebook",
    "Instagram",
    "KakaoTalk",
    "LINE",
    "LinkedIn",
    "Snapchat",
    "TikTok",
    "Twitter",
    "VKontakte",
    "WeChat",
    "WhatsApp",
    "YouTube",
]
PURPOSES = ["Education", "Entertainment", "Networking", "News"]
STRESS_LEVELS = ["Low", "Medium", "High", "Very High"]
COUNTRIES = [
    "Afghanistan", "Albania", "Andorra", "Argentina", "Armenia",
    "Australia", "Austria", "Azerbaijan", "Bahamas", "Bahrain",
    "Bangladesh", "Belarus", "Belgium", "Bhutan", "Bolivia",
    "Bosnia", "Brazil", "Bulgaria", "Canada", "Chile",
    "China", "Colombia", "Costa Rica", "Croatia", "Cyprus",
    "Czech Republic", "Denmark", "Ecuador", "Egypt", "Estonia",
    "Finland", "France", "Georgia", "Germany", "Ghana",
    "Greece", "Hong Kong", "Hungary", "Iceland", "India",
    "Indonesia", "Iraq", "Ireland", "Israel", "Italy",
    "Jamaica", "Japan", "Jordan", "Kazakhstan", "Kenya",
    "Kosovo", "Kuwait", "Kyrgyzstan", "Latvia", "Lebanon",
    "Liechtenstein", "Lithuania", "Luxembourg", "Malaysia", "Maldives",
    "Malta", "Mexico", "Moldova", "Monaco", "Montenegro",
    "Morocco", "Nepal", "Netherlands", "New Zealand", "Nigeria",
    "North Macedonia", "Norway", "Oman", "Other", "Pakistan",
    "Panama", "Paraguay", "Peru", "Philippines", "Poland",
    "Portugal", "Qatar", "Romania", "Russia", "San Marino",
    "Serbia", "Singapore", "Slovakia", "Slovenia", "South Africa",
    "South Korea", "Spain", "Sri Lanka", "Sweden", "Switzerland",
    "Syria", "Taiwan", "Tajikistan", "Thailand", "Trinidad",
    "Turkey", "UAE", "UK", "USA", "Ukraine",
    "Uruguay", "Uzbekistan", "Vatican City", "Venezuela", "Vietnam",
    "Yemen",
]

model = None


def load_model(path=MODEL_PATH):
    with gzip.open(path, "rb") as f:
        return pickle.load(f)


@asynccontextmanager
async def lifespan(app: FastAPI):
    global model
    if not MODEL_PATH.exists():
        raise RuntimeError(f"Model file not found: {MODEL_PATH}")
    model = load_model()
    yield
    model = None


app = FastAPI(
    title="Mental Health Score API",
    description="Predicts a student's mental health score (0-10) from lifestyle and social media habits.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


class StudentData(BaseModel):
    model_config = ConfigDict(
        str_strip_whitespace=True,
        json_schema_extra={
            "example": {
                "age": 21,
                "gender": "Male",
                "country": "Pakistan",
                "academic_level": "Undergraduate",
                "most_used_platform": "Instagram",
                "purpose_of_use": "Entertainment",
                "avg_daily_usage_hours": 3.5,
                "daily_unlocks": 120,
                "study_hours": 4.0,
                "physical_activity_hours": 1.0,
                "sleep_hours_per_night": 7.0,
                "stress_level": "Medium",
            }
        },
    )

    age: int = Field(..., ge=18, le=24, description="Student age in years")
    gender: Literal["Male", "Female"]
    country: str = Field(..., min_length=1, max_length=100)
    academic_level: Literal["High School", "Undergraduate", "Graduate"]
    most_used_platform: str = Field(..., min_length=1, max_length=50)
    purpose_of_use: Literal["Education", "Entertainment", "Networking", "News"]
    avg_daily_usage_hours: float = Field(..., ge=0, le=24)
    daily_unlocks: int = Field(..., ge=0)
    study_hours: float = Field(..., ge=0, le=24)
    physical_activity_hours: float = Field(..., ge=0, le=24)
    sleep_hours_per_night: float = Field(..., ge=0, le=24)
    stress_level: Literal["Low", "Medium", "High", "Very High"]


class PredictionResponse(BaseModel):
    mental_health_score: float = Field(..., ge=0, le=10)
    model: str


class OptionsResponse(BaseModel):
    genders: list[str]
    academic_levels: list[str]
    platforms: list[str]
    purposes: list[str]
    stress_levels: list[str]
    countries: list[str]


def to_frame(data: StudentData) -> pd.DataFrame:
    return pd.DataFrame(
        [
            {
                "Age": data.age,
                "Gender": data.gender,
                "Country": data.country,
                "Academic_Level": data.academic_level,
                "Most_Used_Platform": data.most_used_platform,
                "Purpose_Of_Use": data.purpose_of_use,
                "Avg_Daily_Usage_Hours": data.avg_daily_usage_hours,
                "Daily_Unlocks": data.daily_unlocks,
                "Study_Hours": data.study_hours,
                "Physical_Activity_Hours": data.physical_activity_hours,
                "Sleep_Hours_Per_Night": data.sleep_hours_per_night,
                "Stress_Level": data.stress_level,
            }
        ]
    )


@app.get("/", include_in_schema=False)
def index():
    return FileResponse(BASE_DIR / "index.html")


@app.get("/style.css", include_in_schema=False)
def stylesheet():
    return FileResponse(BASE_DIR / "style.css", media_type="text/css")


@app.get("/script.js", include_in_schema=False)
def javascript():
    return FileResponse(BASE_DIR / "script.js", media_type="application/javascript")


@app.get("/api")
def api_info():
    return {
        "message": "Mental Health Score API is running",
        "docs": "/docs",
        "health": "/health",
        "options": "/options",
        "predict": "/predict",
    }


@app.get("/health")
def health():
    return {"status": "ok", "model_loaded": model is not None}


@app.get("/options", response_model=OptionsResponse)
def options():
    return OptionsResponse(
        genders=GENDERS,
        academic_levels=ACADEMIC_LEVELS,
        platforms=PLATFORMS,
        purposes=PURPOSES,
        stress_levels=STRESS_LEVELS,
        countries=COUNTRIES,
    )


@app.post("/predict", response_model=PredictionResponse)
def predict(data: StudentData):
    if model is None:
        raise HTTPException(status_code=503, detail="Model is not loaded")

    try:
        prediction = float(model.predict(to_frame(data))[0])
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Prediction failed: {exc}") from exc

    return PredictionResponse(
        mental_health_score=round(prediction, 3),
        model=type(model.named_steps["regressor"]).__name__,
    )


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", "8000"))
    uvicorn.run("main:app", host="0.0.0.0", port=port)
