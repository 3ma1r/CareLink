const unsupported = Object.assign(
  () => {
    throw new Error('CareLink PDF reports do not enable jsPDF HTML or SVG conversion.')
  },
  {
    sanitize: () => {
      throw new Error('CareLink PDF reports do not enable jsPDF HTML conversion.')
    },
    fromString: () => {
      throw new Error('CareLink PDF reports do not enable jsPDF SVG conversion.')
    },
  },
)

export default unsupported
