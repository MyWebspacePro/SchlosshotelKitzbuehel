import { database, InputError, saveOwner, workspaceTransaction } from "./store";
import type { AccountSummary, WorkspaceIdentity } from "./model";
import { digest, hashPassword, sessionToken, verifyPassword } from "./passwords";

export type Access = WorkspaceIdentity & { id: string; tokenHash?: string };
type AccountRow = { workspace: string; owner: string; username: string; name: string; admin: boolean; password_hash: string };
export const sessionSeconds = 12 * 60 * 60;

export class AuthenticationError extends Error {}
export class TooManyAttempts extends Error {}

const userPattern = /^[a-z0-9][a-z0-9._-]{2,47}$/;
function cleanUsername(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}
function credentials(usernameValue: unknown, passwordValue: unknown, required: boolean) {
  const username = cleanUsername(usernameValue);
  if (!userPattern.test(username)) throw new InputError("Der Benutzername braucht 3 bis 48 Zeichen: Buchstaben, Ziffern, Punkt, Bindestrich oder Unterstrich.");
  const password = typeof passwordValue === "string" ? passwordValue : "";
  if ((required || password) && (password.length < 15 || password.length > 128)) {
    throw new InputError("Das Passwort muss zwischen 15 und 128 Zeichen lang sein.");
  }
  return { username, password };
}
function identity(account: Pick<AccountRow, "owner" | "username" | "name" | "admin">): WorkspaceIdentity {
  return { owner: account.owner, username: account.username, name: account.name, role: account.admin ? "admin" : "member" };
}
function usernameTaken(error: unknown): never {
  if (error && typeof error === "object" && "code" in error && error.code === "23505") throw new InputError("Dieser Benutzername ist bereits vergeben.");
  throw error;
}

export async function resolveAccess(guest: string | undefined, token: string | undefined): Promise<Access | undefined> {
  if (!guest && !token) return undefined;
  const { query } = await database();
  if (token) {
    const tokenHash = digest(token);
    const result = await query<AccountRow>(`SELECT account.workspace,account.owner,account.username,account.admin,person.name
      FROM hotel_session AS session JOIN hotel_account AS account USING (workspace,owner)
      JOIN hotel_owner AS person ON person.workspace=account.workspace AND person.id=account.owner
      WHERE session.token_hash=$1 AND session.expires_at>now() AND person.active`, [tokenHash]);
    const account = result.rows[0];
    if (account) return { ...identity(account), id: account.workspace, tokenHash };
  }
  if (!guest) return undefined;
  const result = await query(`SELECT 1 FROM hotel_workspace WHERE id=$1 AND ready
    AND NOT EXISTS (SELECT 1 FROM hotel_account WHERE workspace=$1)`, [guest]);
  return result.rows.length ? { id: guest, role: "guest" } : undefined;
}

export async function accountSummaries(access: Access): Promise<AccountSummary[]> {
  if (access.role !== "admin") return [];
  const { query } = await database();
  return (await query<AccountSummary>("SELECT owner,username,admin FROM hotel_account WHERE workspace=$1", [access.id])).rows;
}

export async function throttleAuth(bucket: string, max: number) {
  const { query } = await database();
  const result = await query<{ attempts: number }>(`WITH expired AS (
    DELETE FROM hotel_auth_limit WHERE bucket<>$1 AND expires_at<now()-interval '1 hour'
  ) INSERT INTO hotel_auth_limit (bucket,expires_at,attempts) VALUES ($1,now()+interval '15 minutes',1)
    ON CONFLICT(bucket) DO UPDATE SET
      attempts=CASE WHEN hotel_auth_limit.expires_at<=now() THEN 1 ELSE hotel_auth_limit.attempts+1 END,
      expires_at=CASE WHEN hotel_auth_limit.expires_at<=now() THEN excluded.expires_at ELSE hotel_auth_limit.expires_at END
    RETURNING attempts`, [digest(bucket)]);
  if (result.rows[0].attempts > max) throw new TooManyAttempts();
}

export async function login(usernameValue: unknown, passwordValue: unknown) {
  const username = cleanUsername(usernameValue);
  const password = typeof passwordValue === "string" ? passwordValue : "";
  if (!userPattern.test(username) || !password || password.length > 128) throw new AuthenticationError();
  await throttleAuth("username:" + username, 12);
  const db = await database();
  const result = await db.query<AccountRow>(`SELECT account.*,person.name FROM hotel_account AS account
    JOIN hotel_owner AS person ON person.workspace=account.workspace AND person.id=account.owner
    WHERE account.username=$1 AND person.active`, [username]);
  const account = result.rows[0];
  if (!await verifyPassword(password, account?.password_hash) || !account) throw new AuthenticationError();

  const token = sessionToken();
  await workspaceTransaction(db, account.workspace, async (query) => {
    const created = await query(`INSERT INTO hotel_session (token_hash,workspace,owner,expires_at)
      SELECT $1,account.workspace,account.owner,now()+($5::int * interval '1 second')
      FROM hotel_account AS account JOIN hotel_owner AS person ON person.workspace=account.workspace AND person.id=account.owner
      WHERE account.workspace=$2 AND account.owner=$3 AND account.password_hash=$4 AND account.username=$6 AND person.active
      RETURNING token_hash`, [digest(token), account.workspace, account.owner, account.password_hash, sessionSeconds, username]);
    if (!created.rows.length) throw new AuthenticationError();
    await query("DELETE FROM hotel_session WHERE workspace=$1 AND expires_at<=now()", [account.workspace]);
    await query("DELETE FROM hotel_auth_limit WHERE bucket=$1", [digest("username:" + username)]);
  });
  return { workspace: account.workspace, token };
}

export async function logout(token: string | undefined) {
  if (!token) return;
  const { query } = await database();
  await query("DELETE FROM hotel_session WHERE token_hash=$1", [digest(token)]);
}

export async function saveAccount(access: Access, ownerValue: unknown, usernameValue: unknown, passwordValue: unknown, personChange?: { name: unknown; role: unknown }) {
  if (access.role === "member") throw new AuthenticationError();
  if (!(ownerValue === undefined && personChange) && (typeof ownerValue !== "string" || !/^[a-z0-9-]{1,64}$/.test(ownerValue))) throw new InputError("Wähle eine Person aus der Liste.");
  const { username, password } = credentials(usernameValue, passwordValue, access.role === "guest");
  const db = await database();
  const passwordHash = password ? await hashPassword(password) : null;
  const firstToken = access.role === "guest" ? sessionToken() : undefined;

  return workspaceTransaction(db, access.id, async (query) => {
    if (access.role === "guest") {
      const exists = await query("SELECT 1 FROM hotel_account WHERE workspace=$1 LIMIT 1", [access.id]);
      if (exists.rows.length) throw new AuthenticationError();
    } else {
      const admin = await query(`SELECT 1 FROM hotel_session AS session JOIN hotel_account AS account USING (workspace,owner)
        WHERE token_hash=$1 AND session.workspace=$2 AND account.admin AND session.expires_at>now()`, [access.tokenHash, access.id]);
      if (!admin.rows.length) throw new AuthenticationError();
    }
    const owner = personChange ? await saveOwner(query, access.id, { id: ownerValue, ...personChange }) : ownerValue as string;
    const person = await query("SELECT 1 FROM hotel_owner WHERE workspace=$1 AND id=$2 AND active", [access.id, owner]);
    if (!person.rows.length) throw new InputError("Wähle eine aktive Person aus der Liste.");
    const existing = (await query<AccountSummary>("SELECT owner,username,admin FROM hotel_account WHERE workspace=$1 AND owner=$2", [access.id, owner])).rows[0];
    if (!existing && !passwordHash) throw new InputError("Lege ein Passwort für das neue Konto fest.");

    try {
      if (existing) {
        await query(`UPDATE hotel_account SET username=$3,password_hash=COALESCE($4,password_hash)
          WHERE workspace=$1 AND owner=$2`, [access.id, owner, username, passwordHash]);
        if (passwordHash || existing.username !== username) {
          await query("DELETE FROM hotel_session WHERE workspace=$1 AND owner=$2 AND token_hash<>$3", [access.id, owner, access.tokenHash ?? ""]);
        }
      } else {
        await query("INSERT INTO hotel_account (workspace,owner,username,password_hash,admin) VALUES ($1,$2,$3,$4,$5)",
          [access.id, owner, username, passwordHash, Boolean(firstToken)]);
      }
    } catch (error) { usernameTaken(error); }

    if (firstToken) {
      await query("INSERT INTO hotel_session (token_hash,workspace,owner,expires_at) VALUES ($1,$2,$3,now()+($4::int * interval '1 second'))",
        [digest(firstToken), access.id, owner, sessionSeconds]);
    }
    return { workspace: access.id, token: firstToken };
  });
}
