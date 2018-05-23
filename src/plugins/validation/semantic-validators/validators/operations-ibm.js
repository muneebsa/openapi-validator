// Assertation 1:
// PUT and POST operations must have a non-empty `consumes` field

// Assertation 2:
// GET operations should not specify a consumes field.

// Assertation 3:
// All operations (besides HEAD) must have a non-empty `produces` field.

// Assertation 4:
// Operations must have a non-empty `operationId`

// Assertation 5:
// Operations must have a non-empty `summary` field.

// Assertation 6:
// Arrays MUST NOT be returned as the top-level structure in a response body.
// ref: https://pages.github.ibm.com/CloudEngineering/api_handbook/fundamentals/format.html#object-encapsulation

// Assertation 7:
// All required parameters of an operation are listed before any optional parameters.
// http://watson-developer-cloud.github.io/api-guidelines/swagger-coding-style#parameter-order

import at from "lodash/at"
import each from "lodash/each"
import includes from "lodash/includes"
import map from "lodash/map"
import pick from "lodash/pick"

function resolveRef(obj, jsSpec) {
  if (!obj.$ref) {
    return obj
  }
  if (!obj.$ref.startsWith("#/")) {
    // Only handle internal refs
    return {}
  }

  // the map statement here escapes all path elements in case any key contains
  // a character, such as `.`, that would influence the at() module's
  // ability to find the correct object
  let path = obj.$ref.split("/").slice(1).map(e => `["${e}"]`).join(".")

  let resolved = at(jsSpec, path)[0]
  return resolved
}

export function validate({ jsSpec }, config) {

  let result = {}
  result.error = []
  result.warning = []

  config = config.operations

  map(jsSpec.paths, (path, pathKey) => {
    if (pathKey.slice(0,2) === "x-") {
      return
    }
    let pathOps = pick(path, ["get", "head", "post", "put", "patch", "delete", "options"])
    each(pathOps, (op, opKey) => {

      // if operation is excluded, don't validate it
      if (op["x-sdk-exclude"] === true) {
        // skip this operation in the 'each' loop
        return
      }

      if(includes(["put","post"], opKey.toLowerCase())) {

        let hasLocalConsumes = op.consumes && op.consumes.length > 0 && !!op.consumes.join("").trim()
        let hasGlobalConsumes = !!jsSpec.consumes

        if(!hasLocalConsumes && !hasGlobalConsumes) {
          let checkStatus = config.no_consumes_for_put_or_post

          if (checkStatus !== "off") {
            result[checkStatus].push({
              path: `paths.${pathKey}.${opKey}.consumes`,
              message: "PUT and POST operations must have a non-empty `consumes` field."
            })
          }
        }
      }

      let isHeadOperation = opKey.toLowerCase() === "head"
      if (!isHeadOperation) {
        // operations should have a produces property
        let hasLocalProduces = op.produces && op.produces.length > 0 && !!op.produces.join("").trim()
        let hasGlobalProduces = !!jsSpec.produces

        if (!hasLocalProduces && !hasGlobalProduces) {
          let checkStatus = config.no_produces

          if (checkStatus !== "off") {
            result[checkStatus].push({
              path: `paths.${pathKey}.${opKey}.produces`,
              message: "Operations must have a non-empty `produces` field."
            })
          }
        }
      }

      let isGetOperation = opKey.toLowerCase() === "get"
      if (isGetOperation) {

        // get operations should not have a consumes property
        if (op.consumes) {
          let checkStatus = config.get_op_has_consumes

          if (checkStatus !== "off") {
            result[checkStatus].push({
              path: `paths.${pathKey}.${opKey}.consumes`,
              message: "GET operations should not specify a consumes field."
            })
          }
        }

        // Arrays MUST NOT be returned as the top-level structure in a response body.
        let checkStatus = config.no_array_responses
        if (checkStatus !== "off") {
          each(op.responses, (response, name) => {
            if (response.schema) {
              const responseSchema = resolveRef(response.schema, jsSpec)
              if (responseSchema && responseSchema.type === "array") {
                result[checkStatus].push({
                  path: `paths.${pathKey}.${opKey}.responses.${name}.schema`,
                  message: "Arrays MUST NOT be returned as the top-level structure in a response body."
                })
              }
            }
          })
        }
      }


      let hasOperationId = op.operationId && op.operationId.length > 0 && !!op.operationId.toString().trim()
      if(!hasOperationId) {

        let checkStatus = config.no_operation_id
        if (checkStatus !== "off") {
          result[checkStatus].push({
            path: `paths.${pathKey}.${opKey}.operationId`,
            message: "Operations must have a non-empty `operationId`."
          })
        }
      }

      let hasSummary = op.summary && op.summary.length > 0 && !!op.summary.toString().trim()
      if (!hasSummary) {

        let checkStatus = config.no_summary
        if (checkStatus !== "off") {
          result[checkStatus].push({
            path: `paths.${pathKey}.${opKey}.summary`,
            message: "Operations must have a non-empty `summary` field."
          })
        }
      }

      // All required parameters of an operation are listed before any optional parameters.
      let checkStatus = config.parameter_order
      if (checkStatus !== "off") {

        if (op.parameters && op.parameters.length > 0) {
          let firstOptional = -1
          for (let indx = 0; indx < op.parameters.length; indx++) {
            let param = resolveRef(op.parameters[indx], jsSpec)
            if (firstOptional < 0) {
              if (!param.required) {
                firstOptional = indx
              }
            } else {
              if (param.required) {
                result[checkStatus].push({
                  path: `paths.${pathKey}.${opKey}.parameters[${indx}]`,
                  message: "Required parameters should appear before optional parameters."
                })
              }
            }
          }
        }
      }
    })
  })

  return { errors: result.error, warnings: result.warning }
}
