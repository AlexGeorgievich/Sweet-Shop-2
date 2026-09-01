from pydantic import BaseModel, ConfigDict, EmailStr, Field


class LoginRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    email: EmailStr
    password: str = Field(min_length=8, max_length=200)


class CurrentUser(BaseModel):
    id: str
    email: str
    fullName: str
    role: str
    dataMode: str
