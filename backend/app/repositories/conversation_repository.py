from collections.abc import Sequence
from datetime import datetime
from uuid import UUID

from sqlalchemy import delete, func, select
from sqlalchemy.orm import selectinload

from app.models.conversation import Conversation
from app.models.message import Message
from app.repositories.base import BaseRepository


class ConversationRepository(BaseRepository):
    async def add(self, conversation: Conversation) -> Conversation:
        self.session.add(conversation)
        await self.session.flush()
        return conversation

    async def add_message(self, message: Message) -> Message:
        self.session.add(message)
        await self.session.flush()
        return message

    async def get_detail(self, conversation_id: UUID) -> Conversation | None:
        statement = (
            select(Conversation)
            .options(selectinload(Conversation.messages))
            .where(Conversation.id == conversation_id)
        )
        result = await self.session.scalars(statement)
        return result.first()

    async def list(self, *, limit: int = 20, offset: int = 0) -> list[Conversation]:
        statement = (
            select(Conversation)
            .options(selectinload(Conversation.messages))
            .order_by(Conversation.updated_at.desc())
            .limit(limit)
            .offset(offset)
        )
        result = await self.session.scalars(statement)
        return list(result.all())

    async def recent_messages(
        self, conversation_id: UUID, *, limit: int = 12
    ) -> Sequence[Message]:
        statement = (
            select(Message)
            .where(Message.conversation_id == conversation_id)
            .order_by(Message.created_at.desc())
            .limit(limit)
        )
        result = await self.session.scalars(statement)
        return list(reversed(list(result.all())))

    async def count(self) -> int:
        statement = select(func.count(Conversation.id))
        return int((await self.session.execute(statement)).scalar_one())

    async def delete(self, conversation: Conversation) -> None:
        await self.session.delete(conversation)

    async def delete_message(self, message: Message) -> None:
        await self.session.delete(message)

    async def delete_messages(self, conversation_id: UUID) -> None:
        await self.session.execute(
            delete(Message).where(Message.conversation_id == conversation_id)
        )

    async def get_message(self, message_id: UUID) -> Message | None:
        return await self.session.get(Message, message_id)

    async def count_conversations(self, since: datetime | None = None) -> int:
        statement = select(func.count(Conversation.id))
        if since:
            statement = statement.where(Conversation.created_at >= since)
        return int((await self.session.execute(statement)).scalar_one())

    async def count_messages(self, since: datetime | None = None) -> int:
        statement = select(func.count(Message.id))
        if since:
            statement = statement.where(Message.created_at >= since)
        return int((await self.session.execute(statement)).scalar_one())

    async def count_user_queries(self, since: datetime | None = None) -> int:
        statement = select(func.count(Message.id)).where(Message.role == "user")
        if since:
            statement = statement.where(Message.created_at >= since)
        return int((await self.session.execute(statement)).scalar_one())
