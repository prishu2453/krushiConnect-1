# Security Specification for Agri-Logistics & IoT Marketplace

## Data Invariants
1. **User Profile**: A user profile must match the authenticated user's profile UID, and cannot modify its own roles to subvert access restrictions.
2. **Sensor Data**: Readings must be securely locked to the reporting farmer's user ID, preventing other users from reading or writing sensor logs.
3. **Logistics & Bookings**: Bookings of type `transport` or `storage` can only be read by the owner who created them or designated logistics operators. Status updates must only change the `status` field.
4. **Crops & Listings**: Product listings can be published by any verified farmer and are publicly readable. Editing/deleting is restricted to the owner.

## The "Dirty Dozen" Vulnerability Payloads
1. **Identity Spoofing in Bookings**: Creating a booking with `userId: "victim_123"` but authenticated as `"attacker_456"`.
2. **Privilege Escalation in Users**: Updating user profile to set `role: "admin"` by standard users.
3. **Telemetry Access Hijack**: An attacker registering snapshot listeners to view telemetry data from `/sensorData/{dataId}` belonging to other farmers.
4. **Status Shortcircuiting in Bookings**: Bypassing booking lifecycle stages by directly setting status to `completed` upon creation.
5. **Unauthorized Booking Accepts**: User `A` accepting/updating user `B`'s booking state without being the target provider.
6. **Ghost Fields in Crop Listings**: Injecting unvalidated `isFeatured: true` attributes into the `/listings` documents.
7. **Resource Exhaustion on Document IDs**: Generating 2MB document IDs containing special characters to blow up storage costs or crash indices.
8. **Malicious Value Poisoning in Prices**: Setting crop list price to negative numbers or storing array values where simple numbers are expected.
9. **No-auth Chat Snooping**: Accessing conversations without being an approved participant inside the chat document.
10. **Immutability Breach on Creation**: Attempting to alter a booking's `createdAt` or `userId` after it has already populated the DB.
11. **PII Exposure via Blanket Reads**: Fetching the entire `users` collection without filtering by specific IDs or credentials.
12. **Unverified Email Writes**: Interacting with active operational endpoints (like booking cold storage) using an unverified email address account.

---
This specification guides the construction of robust rulesets to block all twelve attacks mathematically at the database layer.
