/**
 * Tree-sitter query patterns for C++.
 *
 * Like C, declarators may be wrapped (pointer/reference/parenthesized), and
 * inline class methods use `field_identifier` names while free functions and
 * constructors use `identifier` — so we capture the function_declarator and
 * walk it in extraction code to classify the symbol.
 */
export const cppQuery = `
; ===== Function / method definitions =====
(function_definition
  declarator: (function_declarator) @function.declarator
  body: (compound_statement) @function.body) @function.definition

(function_definition
  declarator: (pointer_declarator
    (function_declarator) @function.declarator)
  body: (compound_statement) @function.body) @function.definition

(function_definition
  declarator: (reference_declarator
    (function_declarator) @function.declarator)
  body: (compound_statement) @function.body) @function.definition

; ===== Class / struct definitions =====
(class_specifier
  name: (type_identifier) @class.name
  (base_class_clause
    (_) @class.super)?
  body: (field_declaration_list) @class.body) @class.definition

(struct_specifier
  name: (type_identifier) @class.name
  (base_class_clause
    (_) @class.super)?
  body: (field_declaration_list) @class.body) @class.definition

; ===== Call expressions =====
(call_expression
  function: (identifier) @call.name
  arguments: (argument_list) @call.args) @call.expression

(call_expression
  function: (field_expression
    field: (field_identifier) @call.name) @call.callee
  arguments: (argument_list) @call.args) @call.expression

(call_expression
  function: (template_function
    name: (identifier) @call.name) @call.callee
  arguments: (argument_list) @call.args) @call.expression

; ===== Preprocessor includes =====
(preproc_include
  path: (_) @import.source) @import.node
`;