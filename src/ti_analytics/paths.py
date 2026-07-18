from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
PIPELINE_DIR = PROJECT_ROOT / "pipeline"
CONFIG_DIR = PIPELINE_DIR / "config"
SCHEMAS_DIR = PIPELINE_DIR / "schemas"
DATA_DIR = PIPELINE_DIR / "data"
RAW_DIR = DATA_DIR / "raw"
SILVER_DIR = DATA_DIR / "silver"
GOLD_DIR = DATA_DIR / "gold"
LOGS_DIR = PIPELINE_DIR / "logs"
