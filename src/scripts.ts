export const LOCK_SCRIPT = `
    local result
    if ARGV[2] ~= nil and ARGV[2] ~= "" then
        result = redis.call("SET", KEYS[1], ARGV[1], "NX", "PX", ARGV[2])
    else
        result = redis.call("SET", KEYS[1], ARGV[1], "NX")
    end
    return result
`;

export const EXTEND_SCRIPT = `
    local value = redis.call("GET", KEYS[1])

    if value == KEYS[3] then
        return redis.call("SET",  KEYS[1], value, "PX", KEYS[2], "XX");
    else
        return 0
    end
`;

export const UNLOCK_SCRIPT = `
    if redis.call("GET", KEYS[1]) == ARGV[1] then
        return redis.call("DEL", KEYS[1])
    end

    return 0
`;

export const RENEW_SCRIPT = `
    if redis.call("GET", KEYS[1]) == ARGV[1] then
        return redis.call("PEXPIRE", KEYS[1], ARGV[2])
    else
        return 0
    end
`;

export const CHECK_LOCK_STATUS_SCRIPT = `
    if redis.call("GET", KEYS[1]) == ARGV[1] then
        return "ACQUIRED"
    elseif redis.call("EXISTS", KEYS[1]) == 1 then
        return "LOCKED"
    else
        return "AVAILABLE"
    end
`;