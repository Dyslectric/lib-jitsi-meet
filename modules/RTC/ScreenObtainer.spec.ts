import ScreenObtainer from './ScreenObtainer';

/**
 * A stand-in for the stream getDisplayMedia resolves with, carrying only what
 * the success path actually touches.
 *
 * @param {any[]} applied - Collects the constraint sets applied to the track. A
 * fake cannot obey them, and what the library asks a real track for is the whole
 * of what can be checked here.
 * @returns {any} The fake stream.
 */
function fakeStream(applied: any[] = []) {
    const track = {
        applyConstraints: (constraints: any) => {
            applied.push(constraints);
        },
        contentHint: '',
        getSettings: () => ({ deviceId: 'screen:0:0' }),
        stop: () => { /* nothing to stop */ }
    };

    return {
        getAudioTracks: () => [],
        getVideoTracks: () => [ track ],
        id: 'fake-stream'
    };
}

describe('ScreenObtainer', () => {
    describe('_obtainScreenFromGetDisplayMedia', () => {
        let appliedConstraints: any[];
        let getDisplayMediaSpy: jasmine.Spy;

        beforeEach(() => {
            appliedConstraints = [];

            if (!navigator.mediaDevices) {
                (navigator as any).mediaDevices = {};
            }
            if (!(navigator.mediaDevices as any).getDisplayMedia) {
                (navigator.mediaDevices as any).getDisplayMedia = () => Promise.resolve();
            }
            getDisplayMediaSpy = spyOn(navigator.mediaDevices as any, 'getDisplayMedia')
                .and.callFake(() => Promise.resolve(fakeStream(appliedConstraints)));

            // The rate a deployment configured, which a call is allowed to override.
            (ScreenObtainer as any).init({ desktopSharingFrameRate: { max: 60,
                min: 5 } });
        });

        /**
         * The frame rate handed to getDisplayMedia by the last call to it.
         *
         * @returns {any} The frame rate constraint.
         */
        function capturedFrameRate() {
            return getDisplayMediaSpy.calls.mostRecent().args[0].video.frameRate;
        }

        /**
         * The frame rate the library asked the captured track for afterwards.
         *
         * @returns {any} The frame rate constraint.
         */
        function trackFrameRate() {
            return appliedConstraints[appliedConstraints.length - 1]?.frameRate;
        }

        it('uses the configured frame rate when a call does not choose one', async () => {
            await new Promise<void>(resolve => {
                (ScreenObtainer as any)._obtainScreenFromGetDisplayMedia(() => resolve(), () => resolve());
            });

            expect(capturedFrameRate().max).toBe(60);
        });

        it('prefers the frame rate a call chose', async () => {
            await new Promise<void>(resolve => {
                (ScreenObtainer as any)._obtainScreenFromGetDisplayMedia(
                    () => resolve(),
                    () => resolve(),
                    { desktopSharingFrameRate: { max: 5,
                        min: 5 } });
            });

            expect(capturedFrameRate().max).toBe(5);
        });

        // On Electron this is the only route to the method above, so a rate dropped here reaches
        // every browser and nothing in the desktop app -- which is exactly how it shipped once.
        it('carries a call\'s frame rate through the Electron entry point', async () => {
            (ScreenObtainer as any)._electronSkipDisplayMedia = false;

            await new Promise<void>(resolve => {
                (ScreenObtainer as any)._obtainScreenOnElectron(
                    () => resolve(),
                    () => resolve(),
                    { desktopSharingFrameRate: { max: 5,
                        min: 5 } });
            });

            expect(capturedFrameRate().max).toBe(5);
        });

        // applyConstraints replaces a track's constraints rather than adding to them, so the ceiling
        // left out of it was not merely unchanged: it was unset, and Chromium put the track back to its
        // own default of 30. A share captured at 5 measured 29 fps, and one captured at 60 measured 29
        // too -- every choice looking alike, which is exactly how a menu that does nothing looks.
        it('keeps the ceiling on the track it has just captured', async () => {
            await new Promise<void>(resolve => {
                (ScreenObtainer as any)._obtainScreenFromGetDisplayMedia(
                    () => resolve(),
                    () => resolve(),
                    { desktopSharingFrameRate: { max: 5,
                        min: 5 } });
            });

            expect(trackFrameRate().max).toBe(5);
        });

        // A deployment's floor and a sharer's ceiling meet here for the first time: jitsi-meet builds the
        // rate from config's min and the chosen max, so a deployment configured for at least 15 fps and
        // someone choosing 5 asks for a floor above its ceiling. That cannot be satisfied, and
        // applyConstraints reports it by rejecting the promise nothing awaits.
        it('never asks a track for a floor above its ceiling', async () => {
            await new Promise<void>(resolve => {
                (ScreenObtainer as any)._obtainScreenFromGetDisplayMedia(
                    () => resolve(),
                    () => resolve(),
                    { desktopSharingFrameRate: { max: 5,
                        min: 15 } });
            });

            expect(trackFrameRate().min).toBe(5);
            expect(trackFrameRate().max).toBe(5);
        });

        // getDisplayMedia rejects a frame rate carrying a 'min', so one is taken out on the way. Taking it
        // out of the caller's object rather than a copy erased the configured floor for good: the first
        // share of a session left the deployment with no minimum for any share after it.
        it('leaves the options it was given alone', async () => {
            await new Promise<void>(resolve => {
                (ScreenObtainer as any)._obtainScreenFromGetDisplayMedia(() => resolve(), () => resolve());
            });

            expect((ScreenObtainer as any).options.desktopSharingFrameRate.min).toBe(5);
        });
    });
});
