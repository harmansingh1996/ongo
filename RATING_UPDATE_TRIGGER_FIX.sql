-- Rating Update Trigger Fix
-- This migration creates database triggers to automatically update user ratings when reviews are created, updated, or deleted

-- Step 1: Create the function that updates user ratings
CREATE OR REPLACE FUNCTION update_user_rating_on_review_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Calculate and update the average rating for the reviewed user
  -- Uses COALESCE to handle cases where there are no reviews (defaults to 5.0)
  UPDATE profiles
  SET rating = (
    SELECT COALESCE(ROUND(AVG(rating)::numeric, 2), 5.0)
    FROM reviews
    WHERE reviewed_user_id = COALESCE(NEW.reviewed_user_id, OLD.reviewed_user_id)
  )
  WHERE id = COALESCE(NEW.reviewed_user_id, OLD.reviewed_user_id);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 2: Drop existing triggers if they exist
DROP TRIGGER IF EXISTS update_rating_on_review_insert ON reviews;
DROP TRIGGER IF EXISTS update_rating_on_review_update ON reviews;
DROP TRIGGER IF EXISTS update_rating_on_review_delete ON reviews;

-- Step 3: Create triggers for INSERT, UPDATE, and DELETE operations
CREATE TRIGGER update_rating_on_review_insert
AFTER INSERT ON reviews
FOR EACH ROW
EXECUTE FUNCTION update_user_rating_on_review_change();

CREATE TRIGGER update_rating_on_review_update
AFTER UPDATE ON reviews
FOR EACH ROW
EXECUTE FUNCTION update_user_rating_on_review_change();

CREATE TRIGGER update_rating_on_review_delete
AFTER DELETE ON reviews
FOR EACH ROW
EXECUTE FUNCTION update_user_rating_on_review_change();

-- Step 4: Fix existing ratings for all users with reviews
UPDATE profiles p
SET rating = (
  SELECT COALESCE(ROUND(AVG(r.rating)::numeric, 2), 5.0)
  FROM reviews r
  WHERE r.reviewed_user_id = p.id
)
WHERE p.id IN (SELECT DISTINCT reviewed_user_id FROM reviews);

-- Verification query (optional - run separately to check results)
-- SELECT p.id, p.name, p.rating, COUNT(r.id) as review_count, AVG(r.rating) as calculated_avg
-- FROM profiles p
-- LEFT JOIN reviews r ON r.reviewed_user_id = p.id
-- GROUP BY p.id, p.name, p.rating
-- HAVING COUNT(r.id) > 0
-- ORDER BY p.name;
