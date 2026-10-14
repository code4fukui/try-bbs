/**
 * data/sabae/user/ に保存されている登録者情報をCSVに出力します。
 *
 * 使い方:
 *   deno run --allow-read export_users.js > users.csv
 *   deno run --allow-read --allow-write export_users.js users.csv
 */

const USER_DIR = "data/sabae/user";
const HEADER = ["名前", "メールアドレス", "登録日時"];

const csvEscape = (value) => {
  const text = value == null ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

const getUsers = async () => {
  const users = [];
  for await (const entry of Deno.readDir(USER_DIR)) {
    if (!entry.isFile || !entry.name.endsWith(".json")) continue;
    const path = `${USER_DIR}/${entry.name}`;
    const user = JSON.parse(await Deno.readTextFile(path));
    users.push(user);
  }
  // ファイルシステムの列挙順に依存しないよう、登録日時→メール順にする。
  users.sort((a, b) =>
    String(a.dt ?? "").localeCompare(String(b.dt ?? "")) ||
    String(a.mail ?? "").localeCompare(String(b.mail ?? ""))
  );
  return users;
};

const createCsv = (users) => {
  const rows = [HEADER, ...users.map((user) => [
    user.name,
    user.mail,
    user.dt,
  ])];
  // BOMとCRLFにして、Excelでも文字化けしにくいCSVにする。
  return "\uFEFF" + rows.map((row) => row.map(csvEscape).join(",")).join("\r\n") + "\r\n";
};

const users = await getUsers();
const csv = createCsv(users);
const output = Deno.args[0];

if (output) {
  await Deno.writeTextFile(output, csv);
} else {
  await Deno.stdout.write(new TextEncoder().encode(csv));
}
