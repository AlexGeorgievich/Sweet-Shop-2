from app.schemas.orders import normalize_phone, parse_order


def test_normalizes_common_russian_phone_formats() -> None:
    assert normalize_phone("8 (927) 000-00-00") == "+79270000000"
    assert normalize_phone("927 000 00 00") == "+79270000000"


def test_rejects_unknown_catalog_item() -> None:
    order, fields = parse_order(
        {
            "name": "Анна",
            "phone": "+7 927 000-00-00",
            "dessert": "Неизвестный десерт",
            "date": "2099-09-10",
            "guests": 10,
            "details": "Описание заказа",
            "consent": True,
        }
    )

    assert order is None
    assert fields == {"dessert": "Выберите десерт из каталога."}
