/**
 * Tree-sitter query patterns for Python.
 */
export const pythonQuery = `
; ===== Function definitions =====
(function_definition
  name: (identifier) @function.name
  parameters: (parameters) @function.params
  body: (block) @function.body) @function.definition

; ===== Class definitions =====
(class_definition
  name: (identifier) @class.name
  superclasses: (argument_list (_) @class.super)?
  body: (block) @class.body) @class.definition

; ===== Call expressions =====
(call
  function: (identifier) @call.name
  arguments: (argument_list) @call.args) @call.expression

(call
  function: (attribute
    attribute: (identifier) @call.name) @call.callee
  arguments: (argument_list) @call.args) @call.expression

; ===== Import statements =====
(import_statement) @import.node

(import_from_statement
  module_name: (_) @import.source
  name: (_) @import.symbol) @import.node
`;