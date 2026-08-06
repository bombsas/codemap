/**
 * Tree-sitter query patterns for C.
 *
 * C declarators can be wrapped in pointer_declarator / parenthesized_declarator
 * (`int *foo(int)`), so we capture the function_declarator container and let
 * the extraction code walk it to find the identifier + parameter list.
 */
export const cQuery = `
; ===== Function definitions =====
(function_definition
  declarator: (function_declarator) @function.declarator
  body: (compound_statement) @function.body) @function.definition

(function_definition
  declarator: (pointer_declarator
    (function_declarator) @function.declarator)
  body: (compound_statement) @function.body) @function.definition

; ===== Struct definitions (treated as class-like) =====
(struct_specifier
  name: (type_identifier) @class.name
  body: (field_declaration_list) @class.body) @class.definition

; ===== Call expressions =====
(call_expression
  function: (identifier) @call.name
  arguments: (argument_list) @call.args) @call.expression

(call_expression
  function: (field_expression
    field: (field_identifier) @call.name) @call.callee
  arguments: (argument_list) @call.args) @call.expression

; ===== Preprocessor includes =====
(preproc_include
  path: (_) @import.source) @import.node
`;