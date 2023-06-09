type TryReturnValue<T> = {
    throw: () => T;
    orElse: (value: (() => T) | T) => T,
    catch: (catchHandler: (error: any) => T | void) => T | void
}

export function Try<T>(tryFunction: () => T): TryReturnValue<T> {
    try {
        const result = tryFunction();
        return {
            catch: () => { return result },
            orElse: () => { return result },
            throw: () => { return result }
        }
    } catch (error) {
        return {
            catch: (handler) => { return handler(error) },
            orElse: (val) => {
                if (typeof val === 'function') {
                    return (val as () => T)();
                } else
                    return val
            },
            throw: () => {
                throw error;
            }
        }
    }
}