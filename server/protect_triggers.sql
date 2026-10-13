-- Installed on stb-ranking (prod) and stb-ranking-test. Additive only.
CREATE TRIGGER IF NOT EXISTS protect_players_delete BEFORE DELETE ON players BEGIN SELECT RAISE(ABORT, 'players are permanent: DELETE blocked'); END;
CREATE TRIGGER IF NOT EXISTS protect_players_update BEFORE UPDATE ON players WHEN NEW.id IS NOT OLD.id OR NEW.secret_hash IS NOT OLD.secret_hash OR NEW.created_at IS NOT OLD.created_at BEGIN SELECT RAISE(ABORT, 'players: only nickname may change'); END;
CREATE TRIGGER IF NOT EXISTS protect_scores_delete BEFORE DELETE ON scores BEGIN SELECT RAISE(ABORT, 'scores are permanent: DELETE blocked'); END;
CREATE TRIGGER IF NOT EXISTS protect_scores_update BEFORE UPDATE ON scores BEGIN SELECT RAISE(ABORT, 'scores are immutable: UPDATE blocked'); END;
CREATE TRIGGER IF NOT EXISTS protect_medals_delete BEFORE DELETE ON medals BEGIN SELECT RAISE(ABORT, 'medals are permanent: DELETE blocked'); END;
CREATE TRIGGER IF NOT EXISTS protect_medals_update BEFORE UPDATE ON medals BEGIN SELECT RAISE(ABORT, 'medals are immutable: UPDATE blocked'); END;
CREATE TRIGGER IF NOT EXISTS protect_closed_delete BEFORE DELETE ON closed BEGIN SELECT RAISE(ABORT, 'closed periods are permanent: DELETE blocked'); END;
