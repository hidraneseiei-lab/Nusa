/**
 * =============================================================================
 *  BAHASA NUSA — Abstract Syntax Tree (AST)
 * =============================================================================
 *  Semua node pohon sintaksis abstrak yang dihasilkan oleh Parser dan dibaca
 *  oleh Interpreter didefinisikan di sini. Setiap node membawa informasi
 *  `line`/`col` untuk kebutuhan pelacakan galat runtime.
 * =============================================================================
 */

export type Node = { line: number; col: number };

// ---------------------------------------------------------------------------
// Ekspresi
// ---------------------------------------------------------------------------

export type Expr =
  | LiteralExpr
  | TemplateLiteralExpr
  | IdentifierExpr
  | ArrayExpr
  | ObjectExpr
  | UnaryExpr
  | BinaryExpr
  | LogicalExpr
  | AssignExpr
  | CallExpr
  | MemberExpr
  | FunctionExpr
  | LambdaExpr
  | ThisExpr
  | SuperExpr
  | NewExpr
  | AwaitExpr
  | ConditionalExpr
  | SpreadExpr;

export interface LiteralExpr extends Node {
  kind: "Literal";
  value: number | string | boolean | null;
}

export interface TemplateLiteralExpr extends Node {
  kind: "TemplateLiteral";
  parts: (LiteralExpr | Expr)[];
}

export interface IdentifierExpr extends Node {
  kind: "Identifier";
  name: string;
}

export interface ArrayExpr extends Node {
  kind: "Array";
  elements: Expr[];
}

export interface ObjectExpr extends Node {
  kind: "Object";
  properties: { key: string; computed?: Expr; value: Expr }[];
}

export interface UnaryExpr extends Node {
  kind: "Unary";
  operator: "-" | "!" | "tidak";
  argument: Expr;
}

export interface BinaryExpr extends Node {
  kind: "Binary";
  operator: string;
  left: Expr;
  right: Expr;
}

export interface LogicalExpr extends Node {
  kind: "Logical";
  operator: "dan" | "atau";
  left: Expr;
  right: Expr;
}

export interface AssignExpr extends Node {
  kind: "Assign";
  operator: "=" | "+=" | "-=" | "*=" | "/=";
  target: IdentifierExpr | MemberExpr;
  value: Expr;
}

export interface CallExpr extends Node {
  kind: "Call";
  callee: Expr;
  args: Expr[];
}

export interface MemberExpr extends Node {
  kind: "Member";
  object: Expr;
  property: string | Expr;
  computed: boolean;
  optional?: boolean;
}

export interface FunctionExpr extends Node {
  kind: "FunctionExpr";
  name?: string;
  params: Param[];
  body: BlockStmt;
  isAsync: boolean;
}

export interface LambdaExpr extends Node {
  kind: "Lambda";
  params: Param[];
  body: Expr | BlockStmt;
}

export interface ThisExpr extends Node {
  kind: "This";
}

export interface SuperExpr extends Node {
  kind: "Super";
}

export interface NewExpr extends Node {
  kind: "New";
  callee: Expr;
  args: Expr[];
}

export interface AwaitExpr extends Node {
  kind: "Await";
  argument: Expr;
}

export interface ConditionalExpr extends Node {
  kind: "Conditional";
  test: Expr;
  consequent: Expr;
  alternate: Expr;
}

export interface SpreadExpr extends Node {
  kind: "Spread";
  argument: Expr;
}

export interface Param {
  name: string;
  default?: Expr;
  rest?: boolean;
}

// ---------------------------------------------------------------------------
// Pernyataan (Statement)
// ---------------------------------------------------------------------------

export type Stmt =
  | ExpressionStmt
  | VarDeclStmt
  | BlockStmt
  | IfStmt
  | WhileStmt
  | ForStmt
  | ForEachStmt
  | FunctionDeclStmt
  | ClassDeclStmt
  | ReturnStmt
  | BreakStmt
  | ContinueStmt
  | TryStmt
  | ThrowStmt
  | ImportStmt
  | ExportStmt;

export interface ExpressionStmt extends Node {
  kind: "ExpressionStmt";
  expression: Expr;
}

export interface VarDeclStmt extends Node {
  kind: "VarDecl";
  isConst: boolean;
  name: string;
  init: Expr | null;
}

export interface BlockStmt extends Node {
  kind: "Block";
  body: Stmt[];
}

export interface IfStmt extends Node {
  kind: "If";
  test: Expr;
  consequent: Stmt;
  alternate: Stmt | null;
}

export interface WhileStmt extends Node {
  kind: "While";
  test: Expr;
  body: Stmt;
}

export interface ForStmt extends Node {
  kind: "For";
  init: Stmt | null;
  test: Expr | null;
  update: Expr | null;
  body: Stmt;
}

export interface ForEachStmt extends Node {
  kind: "ForEach";
  varName: string;
  indexName?: string;
  iterable: Expr;
  body: Stmt;
}

export interface FunctionDeclStmt extends Node {
  kind: "FunctionDecl";
  name: string;
  params: Param[];
  body: BlockStmt;
  isAsync: boolean;
}

export interface ClassDeclStmt extends Node {
  kind: "ClassDecl";
  name: string;
  superClass: string | null;
  methods: FunctionDeclStmt[];
  staticMethods: FunctionDeclStmt[];
}

export interface ReturnStmt extends Node {
  kind: "Return";
  value: Expr | null;
}

export interface BreakStmt extends Node {
  kind: "Break";
}

export interface ContinueStmt extends Node {
  kind: "Continue";
}

export interface TryStmt extends Node {
  kind: "Try";
  block: BlockStmt;
  catchParam: string | null;
  catchBlock: BlockStmt | null;
  finallyBlock: BlockStmt | null;
}

export interface ThrowStmt extends Node {
  kind: "Throw";
  argument: Expr;
}

export interface ImportStmt extends Node {
  kind: "Import";
  names: string[];
  from: string;
}

export interface ExportStmt extends Node {
  kind: "Export";
  declaration: Stmt;
}

export interface Program extends Node {
  kind: "Program";
  body: Stmt[];
}
