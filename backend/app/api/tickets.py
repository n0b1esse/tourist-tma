"""Тикеты и обратная связь (ТЗ §2, §4, §5А).

- POST /api/tickets/feedback — любой user → поддержка (супер-админу в Telegram).
- POST /api/tickets/bug — tester+ → баг-репорт напрямую супер-админу.
- GET /api/admin/tickets — список тикетов (только super_admin).
- PATCH /api/admin/tickets/{id} — закрыть/переоткрыть.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_super_admin, require_tester
from app.core.database import get_db
from app.core.notifier import notify_ticket
from app.models.checkin import Ticket
from app.models.user import User
from app.schemas.checkin import TicketCreate, TicketOut

router = APIRouter(prefix="/api/tickets", tags=["tickets"])
admin_router = APIRouter(prefix="/api/admin/tickets", tags=["admin-tickets"])


async def _create(kind: str, body: TicketCreate, user: User, db: AsyncSession) -> TicketOut:
    if kind not in ("feedback", "bug"):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="kind: feedback | bug")
    row = Ticket(
        telegram_id=user.telegram_id, kind=kind, subject=body.subject,
        message=body.message, status="open",
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    try:
        await notify_ticket(user, kind, body.subject, body.message)
    except Exception:
        pass
    return TicketOut(
        id=row.id, telegram_id=row.telegram_id, kind=row.kind,
        subject=row.subject, message=row.message, status=row.status,
    )


@router.post("/feedback", response_model=TicketOut, status_code=status.HTTP_201_CREATED)
async def feedback(body: TicketCreate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await _create("feedback", body, user, db)


@router.post("/bug", response_model=TicketOut, status_code=status.HTTP_201_CREATED)
async def bug_report(body: TicketCreate, user: User = Depends(require_tester), db: AsyncSession = Depends(get_db)):
    return await _create("bug", body, user, db)


@admin_router.get("", response_model=list[TicketOut])
async def list_tickets(
    status_filter: str | None = Query(default=None, alias="status"),
    admin: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Ticket).order_by(Ticket.id.desc()).limit(200)
    if status_filter:
        stmt = stmt.where(Ticket.status == status_filter)
    rows = (await db.execute(stmt)).scalars().all()
    return [
        TicketOut(id=r.id, telegram_id=r.telegram_id, kind=r.kind, subject=r.subject, message=r.message, status=r.status)
        for r in rows
    ]


@admin_router.patch("/{ticket_id}", response_model=TicketOut)
async def close_ticket(
    ticket_id: int,
    admin: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    row = await db.get(Ticket, ticket_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Тикет не найден")
    row.status = "closed" if row.status == "open" else "open"
    await db.commit()
    await db.refresh(row)
    return TicketOut(id=row.id, telegram_id=row.telegram_id, kind=row.kind, subject=row.subject, message=row.message, status=row.status)
