# OnGoPool Testing Guide

## Test Credentials

### Driver Account
- **Email**: `john@driver.com`
- **Password**: (any password)
- **User Type**: Driver
- **Features**: Full driver dashboard with ride management

### Rider/Passenger Account
- **Email**: `sarah@rider.com`
- **Password**: (any password)
- **User Type**: Rider
- **Features**: Full passenger dashboard with ride booking

## Testing Workflow

### Driver Dashboard Testing
1. Login with `john@driver.com`
2. **Home Page**: View ride requests from passengers
3. **Trips Page**: See upcoming, active, and completed rides with filters
4. **Post Ride**: Create new rides with route stops
5. **Chat**: Communicate with riders
6. **Profile**: Manage driver information, ratings, earnings, payout, vehicle details, verification, and SOS

### Rider/Passenger Dashboard Testing
1. Login with `sarah@rider.com`
2. **Home Page**: View your ride requests with status
3. **Find Ride**: Search for available rides (from, to, date, passengers)
4. **Available Rides**: Browse carpool and OnGoPool driver rides
5. **Ride Preview**: Select seats (sedan 4-seat or SUV 7-seat view), view route, driver profile
6. **Booking**: Authorize payment and send request to driver
7. **Trips Page**: Track all ride requests with status filters
8. **Ride Detail**: View full ride info, driver profile, car details, ETA, map, payment status, action buttons
9. **Driver Profile**: Clickable from ride detail - view reviews, ratings, rides driven, vehicle info
10. **Chat**: Message drivers
11. **Profile**: Manage payment methods, payment history, ratings & reviews, report issues, SOS

## Key Features to Test

### Rider Experience
- ✅ Find rides with search filters
- ✅ View available rides separated by Carpool vs OnGoPool drivers
- ✅ Interactive seat selection (different layouts for sedan/SUV)
- ✅ Book rides with payment authorization
- ✅ Track ride request status (pending, confirmed, in-progress, completed, canceled)
- ✅ View driver profiles with ratings and reviews
- ✅ Manage payment methods and history
- ✅ Rate and review drivers after completed rides

### Driver Experience
- ✅ View incoming ride requests
- ✅ Manage rides by status (pending, active, upcoming, completed)
- ✅ Post new rides with multiple stops
- ✅ Track earnings and payout history
- ✅ Verify license and vehicle details
- ✅ Emergency SOS features

### Shared Features
- ✅ Chat communication between drivers and riders
- ✅ Profile management with editable information
- ✅ Report issues support system
- ✅ Emergency SOS functionality
- ✅ Mobile-first responsive design with safe area support

## Mock Data
The application uses localStorage for data persistence. Mock data includes:
- 2 sample users (1 driver, 1 rider)
- Multiple sample rides with different statuses
- Ride requests with payment status tracking
- Available rides (carpool and OnGoPool types)
- Payment methods and history
- Chat messages

## Browser Testing
Test in mobile browsers:
- iOS Safari
- Android Chrome
- Responsive design (375px-430px mobile views)

## Development Commands
- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
