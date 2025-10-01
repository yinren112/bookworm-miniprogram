-- Seed data for staging database load testing

-- Create a test BookMaster
INSERT INTO bookmaster (isbn13, title, author, publisher, original_price, created_at, updated_at)
VALUES ('9787121234567', 'Load Test Book', 'Test Author', 'Test Publisher', 100.00, NOW(), NOW())
ON CONFLICT (isbn13) DO NOTHING;

-- Create a test BookSKU
INSERT INTO booksku (master_id, edition, description, cover_image_url, created_at, updated_at)
SELECT id, '1st Edition', 'A test book for load testing', 'https://example.com/cover.jpg', NOW(), NOW()
FROM bookmaster
WHERE isbn13 = '9787121234567'
ON CONFLICT (master_id, edition) DO NOTHING;

-- Create 100 inventory items for load testing
INSERT INTO inventoryitem (sku_id, condition, cost, selling_price, status, created_at, updated_at)
SELECT
    (SELECT id FROM booksku WHERE master_id = (SELECT id FROM bookmaster WHERE isbn13 = '9787121234567') LIMIT 1),
    'GOOD',
    60.00,
    80.00,
    'in_stock',
    NOW(),
    NOW()
FROM generate_series(1, 100);
