/**
 * Tree-sitter query patterns for Go.
 */
export const goQuery = `
; ===== Function declarations =====
(function_declaration
  name: (identifier) @function.name
  parameters: (parameter_list) @function.params
  body: (block) @function.body) @function.definition

; ===== Method declarations =====
(method_declaration
  receiver: (parameter_list
    (parameter_declaration
      type: (_) @method.receiver)) @method.receiver_pl
  name: (field_identifier) @method.name
  parameters: (parameter_list) @method.params
  body: (block) @method.body) @method.definition

; ===== Struct types (treated as class-like) =====
(type_spec
  name: (type_identifier) @class.name
  type: (struct_type
    body: (field_declaration_list) @class.body)) @class.definition

; ===== Call expressions =====
(call_expression
  function: (identifier) @call.name
  arguments: (argument_list) @call.args) @call.expression

(call_expression
  function: (selector_expression
    operand: (_)
    field: (field_identifier) @call.name) @call.callee
  arguments: (argument_list) @call.args) @call.expression

; ===== Import specs =====
(import_spec
  path: (interpreted_string_literal) @import.source) @import.node
`;