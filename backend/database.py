import os
import certifi
from pymongo import MongoClient
from dotenv import load_dotenv

# .env file se variables ko load karein
load_dotenv()

# Environment variable se URI read karein
mongo_uri = os.getenv("MONGO_URI")

# MongoClient me usi tarah pass karein jaise pehle kiya tha
client = MongoClient(
    mongo_uri,
    tlsCAFile=certifi.where()
)

try:
    client.admin.command("ping")
    print("MongoDB Connected Successfully")
except Exception as e:
    print("Connection Error:", e)

db = client["expense_db"] # database
expense_collection = db["expenses"] #collection


def expense_helper(expense) -> dict:
    if not expense:
        return {}
    return {
        "id": str(expense.get("_id")),
        "user_id": str(expense.get("user_id")), # Kiska expense hai track karne ke liye
        "amount": float(expense.get("amount", 0)),
        "category": str(expense.get("category", "General")),
        "payment_mode": str(expense.get("payment_mode", "Cash")),
        "expense_date": str(expense.get("expense_date", "")),
        "description": str(expense.get("description", "")) if expense.get("description") else None,
        "is_recurring": bool(expense.get("is_recurring", False))
    }

    



