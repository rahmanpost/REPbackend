{
  "openapi": "3.0.3",
  "info": {
    "title": "Rahman Express Post API",
    "version": "1.0.0"
  },
  "servers": [
    { "url": "http://localhost:5000", "description": "Local" }
  ],
  "components": {
    "securitySchemes": {
      "bearerAuth": { "type": "http", "scheme": "bearer", "bearerFormat": "JWT" }
    },
    "schemas": {
      "RegisterRequest": {
        "type": "object",
        "required": ["name","email","password"],
        "properties": {
          "name": { "type": "string" },
          "email": { "type": "string", "format": "email" },
          "password": { "type": "string", "minLength": 8 }
        }
      },
      "LoginRequest": {
        "type": "object",
        "required": ["email","password"],
        "properties": {
          "email": { "type": "string", "format": "email" },
          "password": { "type": "string" }
        }
      },
      "ResetPasswordRequest": {
        "type": "object",
        "required": ["token","password"],
        "properties": {
          "token": { "type": "string" },
          "password": { "type": "string", "minLength": 8 }
        }
      },
      "CreateShipmentRequest": {
        "type": "object",
        "required": ["pickupAddress","deliveryAddress","boxType"],
        "properties": {
          "sender": { "type": "string" },
          "pickupAddress": { "type": "object" },
          "deliveryAddress": { "type": "object" },
          "boxType": {
            "type": "object",
            "properties": { "kind": { "type": "string", "enum": ["PRESET","CUSTOM"] } },
            "required": ["kind"]
          },
          "weightKg": { "type": "number" },
          "isCOD": { "type": "boolean" },
          "codAmount": { "type": "number" }
        }
      }
    }
  },
  "paths": {
    "/api/auth/register": {
      "post": {
        "tags": ["Auth"],
        "requestBody": { "required": true, "content": { "application/json": { "schema": { "$ref": "#/components/schemas/RegisterRequest" } } } },
        "responses": { "201": { "description": "Registered" } }
      }
    },
    "/api/auth/login": {
      "post": {
        "tags": ["Auth"],
        "requestBody": { "required": true, "content": { "application/json": { "schema": { "$ref": "#/components/schemas/LoginRequest" } } } },
        "responses": { "200": { "description": "OK" } }
      }
    },
    "/api/auth/verify-email": {
      "get": {
        "tags": ["Auth"],
        "parameters": [{ "name": "token", "in": "query", "required": true, "schema": { "type": "string" } }],
        "responses": { "200": { "description": "Verified" } }
      }
    },
    "/api/auth/reset-password": {
      "post": {
        "tags": ["Auth"],
        "requestBody": { "required": true, "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ResetPasswordRequest" } } } },
        "responses": { "200": { "description": "Password reset" } }
      }
    },
    "/api/shipments": {
      "post": {
        "security": [{ "bearerAuth": [] }],
        "tags": ["Shipments"],
        "requestBody": { "required": true, "content": { "application/json": { "schema": { "$ref": "#/components/schemas/CreateShipmentRequest" } } } },
        "responses": { "201": { "description": "Created" } }
      }
    },
    "/api/admin/shipments/{id}/reprice/preview": {
      "get": {
        "security": [{ "bearerAuth": [] }],
        "tags": ["Admin"],
        "parameters": [
          { "name": "id", "in": "path", "required": true, "schema": { "type": "string" } },
          { "name": "version", "in": "query", "required": false, "schema": { "type": "string" } }
        ],
        "responses": { "200": { "description": "Preview totals" } }
      }
    },
    "/api/admin/shipments/{id}/reprice": {
      "patch": {
        "security": [{ "bearerAuth": [] }],
        "tags": ["Admin"],
        "parameters": [{ "name": "id", "in": "path", "required": true, "schema": { "type": "string" } }],
        "requestBody": {
          "required": false,
          "content": { "application/json": { "schema": { "type": "object", "properties": { "pricingVersion": { "type": "string" } } } } }
        },
        "responses": { "200": { "description": "Repriced" } }
      }
    },
    "/api/utils/test-mail": {
      "post": {
        "security": [{ "bearerAuth": [] }],
        "tags": ["Utils"],
        "requestBody": {
          "required": true,
          "content": { "application/json": { "schema": { "type": "object", "properties": {
            "to": { "type": "string", "format": "email" },
            "subject": { "type": "string" },
            "html": { "type": "string" },
            "text": { "type": "string" }
          }, "required": ["to"] } } }
        },
        "responses": { "200": { "description": "Attempted" } }
      }
    }
  }
}
