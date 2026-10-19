import json
import os
import logging
from typing import List, Dict, Any, Optional

try:
    import redis
except ImportError:
    redis = None

try:
    import fakeredis
except ImportError:
    fakeredis = None

logger = logging.getLogger("app")

# Resolve absolute file path for local fallback persistence
backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
redis_store_path = os.path.join(backend_dir, "uploads", "redis_chat_store.json")


class RedisService:
    """
    Service for persisting chat history and conversation threads using Redis.
    Tries real Redis server on 127.0.0.1:6379 first.
    If Redis server is not available, uses FakeRedis with local file persistence fallback.
    If Redis package is not installed, falls back to direct JSON file storage.
    """

    def __init__(self):
        self.redis_client = None
        self.is_fake = False
        self.memory_store: Dict[str, Dict[str, Any]] = {}
        self._init_redis()

    def _init_redis(self):
        if redis is not None:
            try:
                client = redis.Redis(host="127.0.0.1", port=6379, db=0, decode_responses=True, socket_timeout=0.3, socket_connect_timeout=0.3)
                client.ping()
                self.redis_client = client
                self.is_fake = False
                logger.info("Connected to native Redis server at 127.0.0.1:6379")
                return
            except Exception as e:
                logger.info(f"Native Redis server not reachable ({e}). Initializing offline persistence...")

        if fakeredis is not None:
            try:
                self.redis_client = fakeredis.FakeRedis(decode_responses=True)
                self.is_fake = True
                self._load_from_disk()
                return
            except Exception as e:
                logger.warning(f"FakeRedis initialization failed: {e}")

        # Pure python JSON store fallback if neither redis nor fakeredis package is available
        self.redis_client = None
        self.is_fake = True
        self._load_from_disk()

    def _load_from_disk(self):
        if os.path.exists(redis_store_path):
            try:
                with open(redis_store_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    if isinstance(data, list):
                        for thread in data:
                            thread_id = thread.get("id")
                            if thread_id:
                                if self.redis_client:
                                    self.redis_client.set(f"cognidesk:thread:{thread_id}", json.dumps(thread))
                                    self.redis_client.sadd("cognidesk:thread_ids", thread_id)
                                else:
                                    self.memory_store[thread_id] = thread
                logger.info(f"Loaded {len(data)} chat threads from offline Redis disk storage.")
            except Exception as err:
                logger.error(f"Error loading offline Redis disk store: {err}")

    def _save_to_disk(self):
        if self.is_fake:
            try:
                threads = self.get_all_threads()
                os.makedirs(os.path.dirname(redis_store_path), exist_ok=True)
                with open(redis_store_path, "w", encoding="utf-8") as f:
                    json.dump(threads, f, indent=2, ensure_ascii=False)
            except Exception as err:
                logger.error(f"Error saving offline Redis disk store: {err}")

    def get_all_threads(self, workspace_id: Optional[int] = None) -> List[Dict[str, Any]]:
        try:
            if self.redis_client:
                thread_ids = self.redis_client.smembers("cognidesk:thread_ids")
                threads = []
                for tid in thread_ids:
                    raw_data = self.redis_client.get(f"cognidesk:thread:{tid}")
                    if raw_data:
                        try:
                            threads.append(json.loads(raw_data))
                        except Exception:
                            pass
            else:
                threads = list(self.memory_store.values())

            if workspace_id is not None:
                filtered = []
                for t in threads:
                    t_ws = t.get("workspace_id")
                    if t_ws == workspace_id or (workspace_id == 1 and t_ws is None):
                        filtered.append(t)
                return filtered

            return threads
        except Exception as e:
            logger.error(f"Error fetching threads from Redis: {e}")
            return list(self.memory_store.values())

    def get_thread(self, thread_id: str) -> Optional[Dict[str, Any]]:
        try:
            if self.redis_client:
                raw_data = self.redis_client.get(f"cognidesk:thread:{thread_id}")
                if raw_data:
                    return json.loads(raw_data)
                return None
            else:
                return self.memory_store.get(thread_id)
        except Exception as e:
            logger.error(f"Error fetching thread {thread_id} from Redis: {e}")
            return self.memory_store.get(thread_id)

    def save_thread(self, thread: Dict[str, Any]) -> bool:
        try:
            thread_id = thread.get("id")
            if not thread_id:
                return False
            if self.redis_client:
                self.redis_client.set(f"cognidesk:thread:{thread_id}", json.dumps(thread))
                self.redis_client.sadd("cognidesk:thread_ids", thread_id)
            else:
                self.memory_store[thread_id] = thread
            self._save_to_disk()
            return True
        except Exception as e:
            logger.error(f"Error saving thread {thread.get('id')} to Redis: {e}")
            return False

    def delete_thread(self, thread_id: str) -> bool:
        try:
            if self.redis_client:
                self.redis_client.delete(f"cognidesk:thread:{thread_id}")
                self.redis_client.srem("cognidesk:thread_ids", thread_id)
            if thread_id in self.memory_store:
                del self.memory_store[thread_id]
            self._save_to_disk()
            return True
        except Exception as e:
            logger.error(f"Error deleting thread {thread_id} from Redis: {e}")
            return False


redis_service = RedisService()
