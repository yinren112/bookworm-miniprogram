-- filename: schema.sql (REVISED AND CORRECTED)

-- Drop existing types and tables to ensure a clean slate, in case of partial success before.
DROP TABLE IF EXISTS OrderItem;
DROP TABLE IF EXISTS "Order";
DROP TABLE IF EXISTS "User";
DROP TABLE IF EXISTS InventoryItem;
DROP TABLE IF EXISTS BookSKU;
DROP TABLE IF EXISTS BookMaster;
DROP TYPE IF EXISTS inventory_status;
DROP TYPE IF EXISTS order_status;
DROP TYPE IF EXISTS book_condition;

CREATE TYPE inventory_status AS ENUM ('in_stock', 'reserved', 'sold', 'returned', 'damaged');
CREATE TYPE order_status AS ENUM ('pending_payment', 'pending_pickup', 'completed', 'cancelled');
CREATE TYPE book_condition AS ENUM ('A', 'B', 'C');

CREATE TABLE BookMaster (
    id SERIAL PRIMARY KEY,
    isbn13 VARCHAR(13) UNIQUE NOT NULL,
    title VARCHAR(255) NOT NULL,
    author VARCHAR(255),
    publisher VARCHAR(255),
    original_price DECIMAL(10, 2),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE BookSKU (
    id SERIAL PRIMARY KEY,
    master_id INTEGER NOT NULL,
    edition VARCHAR(50),
    description TEXT,
    cover_image_url VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_master FOREIGN KEY(master_id) REFERENCES BookMaster(id),
    UNIQUE(master_id, edition)
);

CREATE TABLE InventoryItem (
    id SERIAL PRIMARY KEY,
    sku_id INTEGER NOT NULL,
    condition book_condition NOT NULL,
    cost DECIMAL(10, 2) NOT NULL,
    selling_price DECIMAL(10, 2) NOT NULL,
    status inventory_status NOT NULL DEFAULT 'in_stock',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_sku FOREIGN KEY(sku_id) REFERENCES BookSKU(id)
);

CREATE TABLE "User" (
    id SERIAL PRIMARY KEY,
    openid VARCHAR(255) UNIQUE NOT NULL,
    nickname VARCHAR(255),
    avatar_url VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE "Order" (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    status order_status NOT NULL DEFAULT 'pending_payment',
    total_amount DECIMAL(10, 2) NOT NULL,
    pickup_code VARCHAR(10) UNIQUE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    paid_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    CONSTRAINT fk_user FOREIGN KEY(user_id) REFERENCES "User"(id)
);

CREATE TABLE OrderItem (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL,
    inventory_item_id INTEGER NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    CONSTRAINT fk_order FOREIGN KEY(order_id) REFERENCES "Order"(id),
    CONSTRAINT fk_inventory_item FOREIGN KEY(inventory_item_id) REFERENCES InventoryItem(id),
    UNIQUE(inventory_item_id)
);

-- Note: "User" and "Order" are SQL keywords, so they often need to be quoted.
-- I've left them quoted as a precaution, but removed quotes from all other identifiers.
-- This is a more robust approach.

CREATE INDEX idx_book_master_isbn13 ON BookMaster(isbn13);
CREATE INDEX idx_inventory_item_sku_id_status ON InventoryItem(sku_id, status);
CREATE INDEX idx_order_user_id_status ON "Order"(user_id, status);