/**
 * Tree-sitter query patterns for TypeScript (used for both the
 * `typescript` and `tsx` grammars — the tsx grammar is a superset).
 *
 * TypeScript reuses the JavaScript node shapes for functions, methods,
 * calls and imports, but classes/interfaces use `type_identifier` names
 * and heritage clauses live inside `class_heritage` / `extends_type_clause`.
 */
export const typescriptQuery = `
; ===== Function declarations =====
(function_declaration
  name: (identifier) @function.name
  parameters: (formal_parameters) @function.params
  body: (statement_block) @function.body) @function.definition

(generator_function_declaration
  name: (identifier) @function.name
  parameters: (formal_parameters) @function.params
  body: (statement_block) @function.body) @function.definition

; Arrow functions assigned to a variable: const add = (a, b) => ...
(variable_declarator
  name: (identifier) @function.name
  value: (arrow_function
    parameters: (formal_parameters) @function.params
    body: (_) @function.body) @function.definition)

(pair
  key: (property_identifier) @function.name
  value: (arrow_function
    parameters: (formal_parameters) @function.params
    body: (_) @function.body) @function.definition)

; ===== Methods =====
(method_definition
  name: (property_identifier) @method.name
  parameters: (formal_parameters) @method.params
  body: (statement_block) @method.body) @method.definition

; ===== Classes =====
(class_declaration
  name: (type_identifier) @class.name
  (class_heritage
    (extends_clause (_) @class.super)?
    (implements_clause (_) @class.implements)?)?
  body: (class_body) @class.body) @class.definition

; ===== Interfaces & type aliases (treated as class-like) =====
(interface_declaration
  name: (type_identifier) @class.name
  (extends_type_clause (_) @class.super)?
  body: (interface_body) @class.body) @class.definition

; ===== Call expressions =====
(call_expression
  function: (identifier) @call.name
  arguments: (arguments) @call.args) @call.expression

(call_expression
  function: (member_expression
    property: (property_identifier) @call.name) @call.callee
  arguments: (arguments) @call.args) @call.expression

(new_expression
  constructor: (identifier) @call.name
  arguments: (arguments) @call.args) @call.expression

(new_expression
  constructor: (member_expression
    property: (property_identifier) @call.name) @call.callee
  arguments: (arguments) @call.args) @call.expression

; ===== Imports =====
(import_statement
  source: (string) @import.source) @import.node

(import_statement
  (import_clause
    name: (identifier) @import.symbol))

(import_statement
  (import_clause
    (named_imports
      (import_specifier
        name: (identifier) @import.symbol))))

; require('...')
(call_expression
  function: (identifier) @import.kind
  arguments: (arguments
    (string) @import.source) @import.args) @import.node

; dynamic import('...')
(call_expression
  function: (import)
  arguments: (arguments
    (string) @import.source) @import.args) @import.node
`;
