/**
 * @vitest-environment jsdom
 */
import { faker } from '@faker-js/faker'
import { createRemixStub } from '@remix-run/testing'
import { render, screen } from '@testing-library/react'
import { AuthenticityTokenProvider } from 'remix-utils/csrf/react'
import { test } from 'vitest'
import { loader as rootLoader } from '#app/root.tsx'
import { getSessionExpirationDate } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { invariant } from '#app/utils/misc.tsx'
import { getUserImages, createUser } from '#tests/db-utils.ts'
import { getSessionCookieHeader } from '#tests/utils.ts'
import { default as UsernameRoute, loader } from './$username.tsx'
test('The user profile when not logged in as self', async () => {
	const userImages = await getUserImages()
	const userImage =
		userImages[faker.number.int({ min: 0, max: userImages.length - 1 })]
	const user = await prisma.user.create({
		select: { id: true, name: true, username: true },
		data: { ...createUser(), image: { create: userImage } },
	})
	const App = createRemixStub([
		{
			path: '/users/:username',
			Component: UsernameRoute,
			loader,
		},
	])

	const routeUrl = `/users/${user.username}`
	await render(<App initialEntries={[routeUrl]} />, {
		wrapper: ({ children }) => (
			<AuthenticityTokenProvider token="test-csrf-token">
				{children}
			</AuthenticityTokenProvider>
		),
	})

	invariant(user.name, 'User name should be defined')
	await screen.findByRole('heading', { level: 1, name: user.name })
	await screen.findByRole('img', { name: user.name })
	await screen.findByRole('link', { name: `${user.name}'s notes` })
})

test('The user profile when logged in as self', async () => {
	const userImages = await getUserImages()
	const userImage =
		userImages[faker.number.int({ min: 0, max: userImages.length - 1 })]
	const user = await prisma.user.create({
		select: { id: true, name: true, username: true },
		data: { ...createUser(), image: { create: userImage } },
	})
	const session = await prisma.session.create({
		select: { id: true },
		data: {
			expirationDate: getSessionExpirationDate(),
			userId: user.id,
		},
	})

	const cookieHeader = await getSessionCookieHeader(session)

	const App = createRemixStub([
		{
			id: 'root',
			path: '/',
			loader: async args => {
				// add the cookie header to the request
				args.request.headers.set('cookie', cookieHeader)
				return rootLoader(args)
			},
			children: [
				{
					path: 'users/:username',
					Component: UsernameRoute,
					loader: async args => {
						// add the cookie header to the request
						args.request.headers.set('cookie', cookieHeader)
						return loader(args)
					},
				},
			],
		},
	])

	const routeUrl = `/users/${user.username}`
	await render(<App initialEntries={[routeUrl]} />, {
		wrapper: ({ children }) => (
			<AuthenticityTokenProvider token="test-csrf-token">
				{children}
			</AuthenticityTokenProvider>
		),
	})

	invariant(user.name, 'User name should be defined')
	await screen.findByRole('heading', { level: 1, name: user.name })
	await screen.findByRole('img', { name: user.name })
	await screen.findByRole('button', { name: /logout/i })
	await screen.findByRole('link', { name: /my notes/i })
	await screen.findByRole('link', { name: /edit profile/i })
})
