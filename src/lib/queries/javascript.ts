/**
 * Tree-sitter query patterns for JavaScript (incl. JSX, .mjs/.cjs).
 *
 * Capture conventions used across every language query:
 *   @function.definition / @function.name / @function.params / @function.body
 *   @method.definition  / @method.name  / @method.params  / @method.body
 *   @class.definition   / @class.name   / @class.super    / @class.body
 *   @call.expression / @call.name / @call.callee / @call.args
 *   @import.node / @import.source / @import.symbol
 */
export const javascriptQuery = `
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

; Arrow functions as object property values: { format: (x) => x }
(pair
  key: (property_identifier) @function.name
  value: (arrow_function
    parameters: (formal_parameters) @function.params
    body: (_) @function.body) @function.definition)

; ===== Methods (class bodies & object literals) =====
(method_definition
  name: (property_identifier) @method.name
  parameters: (formal_parameters) @method.params
  body: (statement_block) @method.body) @method.definition

; ===== Classes =====
(class_declaration
  name: (identifier) @class.name
  (class_heritage (_) @class.super)?
  body: (class_body) @class.body) @class.definition

; Class expression assigned to a variable: const Foo = class extends Bar { ... }
(variable_declarator
  name: (identifier) @class.name
  value: (class_expression
    (class_heritage (_) @class.super)?
    body: (class_body) @class.body) @class.definition)

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
