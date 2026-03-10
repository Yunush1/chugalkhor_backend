const Enums = {
    USER: {
        ROLE: {
            USER: 100,
            AI: 102,
            ADMIN: 103,
        },
        LOGIN_METHOD: {
            OTP: 200,
            GOOGLE: 201,
            FACEBOOK: 202,
            PASSWORD: 203,
            APPLE: 204,
        },
        VERIFICATION_STATUS: {
            PENDING: 300,
            APPROVED: 301,
            REJECTED: 302,
            UNDER_REVIEW: 303,
        },
        GENDER: {
            MALE: 1,
            FEMALE: 2,
            OTHER: 3
        },
        PERSONALITY:{
            FRIENDLY:1101,
            FUNNY:1102,
            CURIOUS:1103,
            QUITE:1104
        }
    },
    SERVICE: {
        TYPE: {
            CHAT: 400,
            VIDEO: 401,
            CALL: 402,
            PALMISTRY: 403,
            REPORT: 404,
            POOJA: 405,
            LIVE: 406,
        },
        STATUS: {
            PENDING: 500,
            COMPLETED: 501,
            CANCELLED: 502,
            NO_SHOW: 503,
            ONGOING: 504,
        },
        FOLLOW: {
            PENDING: 505,
            ACCEPTED: 506,
            REJECTED: 507,
        },
    },

    PAYMENT: {
        STATUS: {
            PENDING: 600,
            PAID: 601,
            REFUNDED: 602,
            FAILED: 603,
            CANCELLED: 604,
        },
        METHOD: {
            CREDIT_CARD: 700,
            DEBIT_CARD: 701,
            UPI: 702,
            WALLET: 703,
            NET_BANKING: 704,
        },
        PROVIDER: {
            RAZORPAY: 800,
            PAYTM: 801,
            STRIPE: 802,
            CASHFREE: 803,
            ASTROUP: 804,
            PHONEPAY: 805,
        },
    },
    MESSAGE: {
        TYPE: {
            TEXT: 1200,
            IMAGE: 1201,
            VIDEO: 1202,
            AUDIO: 1203,
            SYSTEM: 1204,
        }
    }


}

Object.freeze(Enums);

module.exports = Enums;