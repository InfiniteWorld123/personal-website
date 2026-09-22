export type ResponseOk<T> = {
  success: true
  message: string
  data: T
}

export type ResponseFailure = {
  success: false
  message: string
  code: string
  details?: unknown
}

export const responseOk = <T>({ data, message }: { data: T; message?: string }): ResponseOk<T> => ({
  success: true,
  message: message ?? 'Success',
  data,
})

export const responseFailure = ({
  message,
  code,
  details,
}: {
  message: string
  code: string
  details?: unknown
}): ResponseFailure => ({ success: false, message, code, details })
