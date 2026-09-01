from fastapi import APIRouter

from app.api.auth import router as auth_router
from app.api.crm import router as crm_router
from app.api.data_modes import router as data_modes_router
from app.api.health import router as health_router
from app.api.operations import router as operations_router
from app.api.orders import router as orders_router

api_router = APIRouter()
api_router.include_router(auth_router)
api_router.include_router(crm_router)
api_router.include_router(data_modes_router)
api_router.include_router(health_router)
api_router.include_router(orders_router)
api_router.include_router(operations_router)
