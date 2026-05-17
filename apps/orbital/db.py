import logging
import os

logger = logging.getLogger(__name__)


def run_migrations() -> None:
    url = os.environ.get('DATABASE_URL')
    if not url:
        return
    try:
        import psycopg2  # noqa: PLC0415
        migration_path = os.path.join(os.path.dirname(__file__), 'migrations', '001_initial.sql')
        with open(migration_path) as f:
            sql = f.read()
        conn = psycopg2.connect(url)
        try:
            with conn.cursor() as cur:
                cur.execute(sql)
            conn.commit()
            logger.info('Migrations applied.')
        finally:
            conn.close()
    except Exception as exc:
        logger.error('Migration failed: %s', exc)
