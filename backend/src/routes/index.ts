import { Router } from 'express'
import authRoutes from '../modules/auth/auth.routes.js'
import usersRoutes from '../modules/users/users.routes.js'
import registrationsRoutes from '../modules/registrations/registrations.routes.js'
import verificationsRoutes from '../modules/police/verifications.routes.js'
import requestsRoutes from '../modules/requests/requests.routes.js'
import volunteersRoutes from '../modules/volunteers/volunteers.routes.js'
import policeRequestsRoutes from '../modules/police/requests.routes.js'
import { emergencyRoutes, policeEmergencyRoutes } from '../modules/emergency/emergency.routes.js'
import auditRoutes from '../modules/police/audit.routes.js'
import voiceRoutes from '../modules/voice/voice.routes.js'

const apiRouter = Router()

apiRouter.use('/auth', authRoutes)
apiRouter.use(usersRoutes)
apiRouter.use('/registrations', registrationsRoutes)
apiRouter.use('/verifications', verificationsRoutes)
apiRouter.use('/requests', requestsRoutes)
apiRouter.use('/volunteers', volunteersRoutes)
apiRouter.use('/police/requests', policeRequestsRoutes)
apiRouter.use('/police/emergency-events', policeEmergencyRoutes)
apiRouter.use('/emergency-events', emergencyRoutes)
apiRouter.use('/audit-logs', auditRoutes)
apiRouter.use('/voice-sessions', voiceRoutes)

export default apiRouter