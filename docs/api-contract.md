# قرارداد API آینده — فقط سند؛ در فاز اول هیچ پیاده‌سازی‌ای وجود ندارد

Base URL آینده: `{API_BASE_URL}/v1`

## Endpoints آینده
- `GET /tasks`
- `POST /tasks`
- `PATCH /tasks/:id`
- `DELETE /tasks/:id`

## Payload (Task)
```json
{
  "id": "uuid-v4",
  "schemaVersion": 1,
  "recordVersion": 7,
  "createdAt": "2026-10-25T09:30:00Z",
  "updatedAt": "2026-10-25T10:00:00Z",
  "title": "تماس با مشتری",
  "description": "",
  "dueDate": "2026-11-01",
  "status": "برنامه‌ریزی",
  "priority": "normal",
  "category": null,
  "tags": []
}
```

## پاسخ موفق
```json
{ "data": { "...task": "" }, "meta": { "requestId": "..." } }
```

## کدهای وضعیت
- 200 موفق · 201 ایجاد · 400 درخواست نامعتبر · 401 احراز نشده · 404 یافت نشد · 409 تعارض نسخه · 422 اعتبارسنجی · 429 محدودیت نرخ · 500 سرور

## قالب خطا
```json
{ "error": { "code": "ERROR_CODE", "message": "Human-readable message", "details": {} } }
```

## احراز هویت آینده
`Authorization: Bearer <token>`

## حل تعارض آینده
last-write-wins بر اساس `updatedAt` سرور؛ `recordVersion` صرفاً برای آگاهی از بازبینی رکورد است و قفل خوش‌بینانه محسوب نمی‌شود.

## pagination/validation
تصمیم طراحی آینده است و در فاز دوم پس از مشخص شدن حجم داده تعیین می‌شود.
