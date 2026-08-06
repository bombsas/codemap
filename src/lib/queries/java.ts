/**
 * Tree-sitter query patterns for Java.
 */
export const javaQuery = `
; ===== Method declarations =====
(method_declaration
  name: (identifier) @method.name
  parameters: (formal_parameters) @method.params
  body: (block) @method.body) @method.definition

; ===== Constructor declarations =====
(constructor_declaration
  name: (identifier) @method.name
  parameters: (formal_parameters) @method.params
  body: (constructor_body) @method.body) @method.definition

; ===== Class declarations =====
(class_declaration
  name: (identifier) @class.name
  superclass: (superclass (_) @class.super)?
  interfaces: (super_interfaces) @class.interfaces?
  body: (class_body) @class.body) @class.definition

; ===== Interface declarations =====
(interface_declaration
  name: (identifier) @class.name
  body: (interface_body) @class.body) @class.definition

; ===== Call expressions =====
(method_invocation
  name: (identifier) @call.name
  arguments: (argument_list) @call.args) @call.expression

(object_creation_expression
  type: (_) @call.name
  arguments: (argument_list) @call.args) @call.expression

; ===== Import declarations =====
(import_declaration
  (scoped_identifier) @import.source) @import.node
`;