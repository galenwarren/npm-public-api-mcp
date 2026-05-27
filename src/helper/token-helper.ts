import { ClientCredentials } from 'simple-oauth2'
import { setTimeout } from 'node:timers/promises';
import pRetry from 'p-retry';

// removed in favor of dynamic token loading
// const USER_TOKEN = process.env.EBAY_CLIENT_TOKEN || "";

// track the access token ready state
const { promise: accessTokenReadyPromise, resolve: accessTokenReadyResolve, reject: accessTokenReadyReject } = Promise.withResolvers()

// store the access token, this is not valid until the promise above is resolved
let accessToken: string = ""


/**
 * Get the current user token
 */
export async function getAccessToken(): Promise<string> {
  await accessTokenReadyPromise
  return accessToken
}

/**
 * Get the token host
 */
function getTokenHost(environment: string): string {
  switch (environment) {
    case "sandbox":
      return "https://api.sandbox.ebay.com"
    case "production":
      return "https://api.ebay.com"
    default:
      throw new Error(`Unsupported ebay environment: ${environment}`)
  }
}

/**
 * Called to run the loop that manages the access token
 */
export async function manageAccessToken(expirationWindow: number, maxRetryTime: number): Promise<void> {

  // create the oauth client
  const client = new ClientCredentials({
    client: {
      id: process.env.EBAY_CLIENT_ID!,
      secret: process.env.EBAY_CLIENT_SECRET!,
    },
    auth: {
      tokenHost: getTokenHost(process.env.EBAY_ENVIRONMENT!),
      tokenPath: "identity/v1/oauth2/token",
    },
  })

  // retriable function
  const getToken = async () => client.getToken({ scope: process.env.EBAY_SCOPE })

  // loop to keep the token refreshed
  while (true) {
    try {

      // get a new token
      const result = await pRetry(getToken, { maxRetryTime })

      // store it and resolve
      accessToken = result.token.access_token as string
      accessTokenReadyResolve(null)

      // read the lifetime and determine how long to wait before 
      // getting a new token
      const expiresIn = (result.token.expires_in as number) * 1000
      const expireAfter = expiresIn - expirationWindow
      console.error(`Generated access token, will regenerate in ${expireAfter / 1000} seconds`)
      await setTimeout(expireAfter)

    } catch (e) {

      // reject and rethrow
      accessTokenReadyReject(e)
      throw e
    }
  }
}

