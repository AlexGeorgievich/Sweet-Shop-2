from enum import StrEnum


class DataMode(StrEnum):
    PRODUCTION = "production"
    DEMO = "demo"


class UserRole(StrEnum):
    ADMIN = "admin"
    LEAD = "lead"
    MANAGER = "manager"
    VIEWER = "viewer"


class OrderStatus(StrEnum):
    NEW = "new"
    ASSIGNED = "assigned"
    CONTACTED = "contacted"
    QUALIFIED = "qualified"
    CALCULATION = "calculation"
    APPROVAL = "approval"
    AWAITING_PAYMENT = "awaiting_payment"
    PAID = "paid"
    PRODUCTION = "production"
    READY = "ready"
    COMPLETED = "completed"
    LOST = "lost"


class TaskStatus(StrEnum):
    OPEN = "open"
    DONE = "done"
    CANCELLED = "cancelled"


class OutboxStatus(StrEnum):
    PENDING = "pending"
    PROCESSING = "processing"
    DELIVERED = "delivered"
    DEAD = "dead"
