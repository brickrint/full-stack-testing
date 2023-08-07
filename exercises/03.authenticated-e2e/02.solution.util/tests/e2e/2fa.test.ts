import { faker } from '@faker-js/faker'
import { expect, test, type Page } from '@playwright/test'
import * as cookie from 'cookie'
import { sessionKey } from '~/utils/auth.server.ts'
import { prisma } from '~/utils/db.server.ts'
import { sessionStorage } from '~/utils/session.server.ts'
import { insertNewUser } from '../db-utils.ts'

test('Users can add 2FA to their account and use it when logging in', async ({
	page,
	baseURL,
}) => {
	const password = faker.internet.password()
	const user = await insertNewUser({ password })
	await loginPage({ page, baseURL, user })
	await page.goto('/settings/profile')

	await page.getByRole('link', { name: /enable 2fa/i }).click()

	await expect(page).toHaveURL(`/settings/profile/two-factor`)
	const main = page.getByRole('main')
	await main.getByRole('button', { name: /enable 2fa/i }).click()
})

export async function loginPage({
	page,
	baseURL = `http://localhost:${process.env.PORT}/`,
	user: givenUser,
}: {
	page: Page
	baseURL: string | undefined
	user?: { id: string }
}) {
	const user = givenUser
		? await prisma.user.findUniqueOrThrow({
				where: { id: givenUser.id },
				select: {
					id: true,
					email: true,
					username: true,
					name: true,
				},
		  })
		: await insertNewUser()
	const session = await prisma.session.create({
		data: {
			expirationDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
			userId: user.id,
		},
		select: { id: true },
	})

	const cookieSession = await sessionStorage.getSession()
	cookieSession.set(sessionKey, session.id)
	const cookieValue = await sessionStorage.commitSession(cookieSession)
	const { en_session } = cookie.parse(cookieValue)
	await page.context().addCookies([
		{
			name: 'en_session',
			sameSite: 'Lax',
			url: baseURL,
			httpOnly: true,
			secure: process.env.NODE_ENV === 'production',
			value: en_session,
		},
	])
	return user as typeof user & { name: string }
}